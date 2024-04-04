import {Buffer} from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {findSourceMap} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';

import cbor from 'cbor';
import concordance from 'concordance';
import indentString from 'indent-string';
import memoize from 'memoize';
import writeFileAtomic from 'write-file-atomic';

import {snapshotManager as concordanceOptions} from './concordance-options.js';
import slash from './slash.cjs';

// Increment if encoding layout or Concordance serialization versions change. Previous AVA versions will not be able to
// decode buffers generated by a newer version, so changing this value will require a major version bump of AVA itself.
// The version is encoded as an unsigned 16 bit integer.
const VERSION = 3;

const VERSION_HEADER = Buffer.alloc(2);
VERSION_HEADER.writeUInt16LE(VERSION);

// The decoder matches on the trailing newline byte (0x0A).
const READABLE_PREFIX = Buffer.from(`AVA Snapshot v${VERSION}\n`, 'ascii');
const REPORT_SEPARATOR = Buffer.from('\n\n', 'ascii');
const REPORT_TRAILING_NEWLINE = Buffer.from('\n', 'ascii');

const SHA_256_HASH_LENGTH = 32;

export class SnapshotError extends Error {
	constructor(message, snapPath) {
		super(message);
		this.name = 'SnapshotError';
		this.snapPath = snapPath;
	}
}

export class ChecksumError extends SnapshotError {
	constructor(snapPath) {
		super('Checksum mismatch', snapPath);
		this.name = 'ChecksumError';
	}
}

export class VersionMismatchError extends SnapshotError {
	constructor(snapPath, version) {
		super('Unexpected snapshot version', snapPath);
		this.name = 'VersionMismatchError';
		this.snapVersion = version;
		this.expectedVersion = VERSION;
	}
}

export class InvalidSnapshotError extends SnapshotError {
	constructor(snapPath) {
		super('Invalid snapshot file', snapPath);
		this.name = 'InvalidSnapshotError';
	}
}

const LEGACY_SNAPSHOT_HEADER = Buffer.from('// Jest Snapshot v1');
function isLegacySnapshot(buffer) {
	return LEGACY_SNAPSHOT_HEADER.equals(buffer.slice(0, LEGACY_SNAPSHOT_HEADER.byteLength));
}

export class LegacyError extends SnapshotError {
	constructor(snapPath) {
		super('Legacy snapshot file', snapPath);
		this.name = 'LegacyError';
	}
}

function tryRead(file) {
	try {
		return fs.readFileSync(file);
	} catch (error) {
		if (error.code === 'ENOENT') {
			return null;
		}

		throw error;
	}
}

function formatEntry(snapshot, index) {
	const {
		data,
		label = `Snapshot ${index + 1}`, // Human-readable labels start counting at 1.
	} = snapshot;

	const description = data
		? concordance.formatDescriptor(concordance.deserialize(data), concordanceOptions)
		: '<No Data>';

	const blockquote = label.split(/\n/).map(line => '> ' + line).join('\n');

	return `${blockquote}\n\n${indentString(description, 4)}`;
}

function combineEntries({blocks}) {
	const combined = new BufferBuilder();

	for (const {title, snapshots} of blocks) {
		const last = snapshots.at(-1);
		combined.write(`\n\n## ${title}\n\n`);

		for (const [index, snapshot] of snapshots.entries()) {
			combined.write(formatEntry(snapshot, index));

			if (snapshot !== last) {
				combined.write(REPORT_SEPARATOR);
			}
		}
	}

	return combined;
}

function generateReport(relFile, snapFile, snapshots) {
	return new BufferBuilder()
		.write(`# Snapshot report for \`${slash(relFile)}\`

The actual snapshot is saved in \`${snapFile}\`.

Generated by [AVA](https://avajs.dev).`)
		.append(combineEntries(snapshots))
		.write(REPORT_TRAILING_NEWLINE)
		.toBuffer();
}

class BufferBuilder {
	constructor() {
		this.buffers = [];
		this.byteOffset = 0;
	}

	append(builder) {
		this.buffers.push(...builder.buffers);
		this.byteOffset += builder.byteOffset;
		return this;
	}

	write(data) {
		if (typeof data === 'string') {
			this.write(Buffer.from(data, 'utf8'));
		} else {
			this.buffers.push(data);
			this.byteOffset += data.byteLength;
		}

		return this;
	}

	toBuffer() {
		return Buffer.concat(this.buffers, this.byteOffset);
	}
}

function sortBlocks(blocksByTitle, blockIndices) {
	return [...blocksByTitle].sort(
		([aTitle], [bTitle]) => {
			const a = blockIndices.get(aTitle);
			const b = blockIndices.get(bTitle);

			if (a === undefined) {
				if (b === undefined) {
					return 0;
				}

				return 1;
			}

			if (b === undefined) {
				return -1;
			}

			return a - b;
		},
	);
}

async function encodeSnapshots(snapshotData) {
	const encoded = await cbor.encodeAsync(snapshotData, {
		omitUndefinedProperties: true,
		canonical: true,
	});
	const compressed = zlib.gzipSync(encoded);
	compressed[9] = 0x03; // Override the GZip header containing the OS to always be Linux
	const sha256sum = crypto.createHash('sha256').update(compressed).digest();
	return Buffer.concat([
		READABLE_PREFIX,
		VERSION_HEADER,
		sha256sum,
		compressed,
	], READABLE_PREFIX.byteLength + VERSION_HEADER.byteLength + SHA_256_HASH_LENGTH + compressed.byteLength);
}

export function extractCompressedSnapshot(buffer, snapPath) {
	if (isLegacySnapshot(buffer)) {
		throw new LegacyError(snapPath);
	}

	// The version starts after the readable prefix, which is ended by a newline
	// byte (0x0A).
	const newline = buffer.indexOf(0x0A);
	if (newline === -1) {
		throw new InvalidSnapshotError(snapPath);
	}

	const versionOffset = newline + 1;
	const version = buffer.readUInt16LE(versionOffset);
	if (version !== VERSION) {
		throw new VersionMismatchError(snapPath, version);
	}

	const sha256sumOffset = versionOffset + 2;
	const compressedOffset = sha256sumOffset + SHA_256_HASH_LENGTH;
	const compressed = buffer.slice(compressedOffset);

	return {
		version, compressed, sha256sumOffset, compressedOffset,
	};
}

function decodeSnapshots(buffer, snapPath) {
	const {compressed, sha256sumOffset, compressedOffset} = extractCompressedSnapshot(buffer, snapPath);

	const sha256sum = crypto.createHash('sha256').update(compressed).digest();
	const expectedSum = buffer.slice(sha256sumOffset, compressedOffset);
	if (!sha256sum.equals(expectedSum)) {
		throw new ChecksumError(snapPath);
	}

	const decompressed = zlib.gunzipSync(compressed);
	return cbor.decode(decompressed);
}

class Manager {
	constructor(options) {
		this.dir = options.dir;
		this.recordNewSnapshots = options.recordNewSnapshots;
		this.updating = options.updating;
		this.relFile = options.relFile;
		this.reportFile = options.reportFile;
		this.reportPath = options.reportPath;
		this.snapFile = options.snapFile;
		this.snapPath = options.snapPath;
		this.oldBlocksByTitle = options.oldBlocksByTitle;
		this.newBlocksByTitle = options.newBlocksByTitle;
		this.blockIndices = new Map();
		this.error = options.error;

		this.hasChanges = false;
	}

	touch(title, taskIndex) {
		this.blockIndices.set(title, taskIndex);
	}

	compare(options) {
		if (this.error) {
			throw this.error;
		}

		const block = this.newBlocksByTitle.get(options.belongsTo);

		const snapshot = block?.snapshots[options.index];
		const data = snapshot?.data;

		if (!data) {
			if (!this.recordNewSnapshots) {
				return {pass: false};
			}

			if (options.deferRecording) {
				const record = this.deferRecord(options);
				return {pass: true, record};
			}

			this.record(options);
			return {pass: true};
		}

		const actual = concordance.deserialize(data, concordanceOptions);
		const expected = concordance.describe(options.expected, concordanceOptions);
		const pass = concordance.compareDescriptors(actual, expected);

		return {actual, expected, pass};
	}

	recordSerialized({data, label, belongsTo, index}) {
		const block = this.newBlocksByTitle.get(belongsTo) ?? {snapshots: []};
		const {snapshots} = block;

		if (index > snapshots.length) {
			throw new RangeError(`Cannot record snapshot ${index} for ${JSON.stringify(belongsTo)}, exceeds expected index of ${snapshots.length}`);
		} else if (index < snapshots.length) {
			if (snapshots[index].data) {
				throw new RangeError(`Cannot record snapshot ${index} for ${JSON.stringify(belongsTo)}, already exists`);
			}

			snapshots[index] = {data, label};
		} else {
			snapshots.push({data, label});
		}

		this.newBlocksByTitle.set(belongsTo, block);
	}

	deferRecord(options) {
		const {expected, belongsTo, label, index} = options;
		const descriptor = concordance.describe(expected, concordanceOptions);
		const data = concordance.serialize(descriptor);

		return () => { // Must be called in order!
			this.hasChanges = true;
			this.recordSerialized({
				data, label, belongsTo, index,
			});
		};
	}

	record(options) {
		const record = this.deferRecord(options);
		record();
	}

	skipBlock(title) {
		const block = this.oldBlocksByTitle.get(title);

		if (block) {
			this.newBlocksByTitle.set(title, block);
		}
	}

	skipSnapshot({belongsTo, index, deferRecording}) {
		const oldBlock = this.oldBlocksByTitle.get(belongsTo);
		const snapshot = oldBlock?.snapshots[index] ?? {};

		// Retain the label from the old snapshot, so as not to assume that the
		// snapshot.skip() arguments are well-formed.

		// Defer recording if called in a try().
		if (deferRecording) {
			return () => { // Must be called in order!
				this.recordSerialized({belongsTo, index, ...snapshot});
			};
		}

		this.recordSerialized({belongsTo, index, ...snapshot});
	}

	async save() {
		const {dir, relFile, snapFile, snapPath, reportPath} = this;

		if (this.updating && this.newBlocksByTitle.size === 0) {
			return {
				changedFiles: [cleanFile(snapPath), cleanFile(reportPath)].flat(),
				temporaryFiles: [],
			};
		}

		if (!this.hasChanges) {
			return null;
		}

		const snapshots = {
			blocks: sortBlocks(this.newBlocksByTitle, this.blockIndices).map(
				([title, block]) => ({title, ...block}),
			),
		};

		const buffer = await encodeSnapshots(snapshots);
		const reportBuffer = generateReport(relFile, snapFile, snapshots);

		await fs.promises.mkdir(dir, {recursive: true});

		const temporaryFiles = [];
		const tmpfileCreated = file => temporaryFiles.push(file);
		await Promise.all([
			writeFileAtomic(snapPath, buffer, {tmpfileCreated}),
			writeFileAtomic(reportPath, reportBuffer, {tmpfileCreated}),
		]);
		return {
			changedFiles: [snapPath, reportPath],
			temporaryFiles,
		};
	}
}

const resolveSourceFile = memoize(file => {
	const sourceMap = findSourceMap(file);
	// Prior to Node.js 18.8.0, the value when a source map could not be found was `undefined`.
	// This changed to `null` in <https://github.com/nodejs/node/pull/43875>. Check both.
	if (sourceMap === undefined || sourceMap === null) {
		return file;
	}

	const {payload} = sourceMap;
	if (payload.sources.length === 0) { // Hypothetical?
		return file;
	}

	return payload.sources[0].startsWith('file://')
		? fileURLToPath(payload.sources[0])
		: payload.sources[0];
});

export const determineSnapshotDir = memoize(({file, fixedLocation, projectDir}) => {
	const testDir = path.dirname(resolveSourceFile(file));
	if (fixedLocation) {
		const relativeTestLocation = path.relative(projectDir, testDir);
		return path.join(fixedLocation, relativeTestLocation);
	}

	const parts = new Set(path.relative(projectDir, testDir).split(path.sep));
	if (parts.has('__tests__')) {
		return path.join(testDir, '__snapshots__');
	}

	if (parts.has('test') || parts.has('tests')) { // Accept tests, even though it's not in the default test patterns
		return path.join(testDir, 'snapshots');
	}

	return testDir;
}, {cacheKey: ([{file}]) => file});

function determineSnapshotPaths({file, fixedLocation, projectDir}) {
	const dir = determineSnapshotDir({file, fixedLocation, projectDir});
	const relFile = path.relative(projectDir, resolveSourceFile(file));
	const name = path.basename(relFile);
	const reportFile = `${name}.md`;
	const snapFile = `${name}.snap`;

	return {
		dir,
		relFile,
		snapFile,
		reportFile,
		snapPath: path.join(dir, snapFile),
		reportPath: path.join(dir, reportFile),
	};
}

function cleanFile(file) {
	try {
		fs.unlinkSync(file);
		return [file];
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}
}

export function load({file, fixedLocation, projectDir, recordNewSnapshots, updating}) {
	// Keep runner unit tests that use `new Runner()` happy
	if (file === undefined || projectDir === undefined) {
		return new Manager({
			recordNewSnapshots,
			updating,
			oldBlocksByTitle: new Map(),
			newBlocksByTitle: new Map(),
		});
	}

	const paths = determineSnapshotPaths({file, fixedLocation, projectDir});
	const buffer = tryRead(paths.snapPath);

	if (!buffer) {
		return new Manager({
			recordNewSnapshots,
			updating,
			...paths,
			oldBlocksByTitle: new Map(),
			newBlocksByTitle: new Map(),
		});
	}

	let blocksByTitle;
	let snapshotError;

	try {
		const data = decodeSnapshots(buffer, paths.snapPath);
		blocksByTitle = new Map(data.blocks.map(({title, ...block}) => [title, block]));
	} catch (error) {
		blocksByTitle = new Map();

		if (!updating) { // Discard all decoding errors when updating snapshots
			snapshotError = error instanceof SnapshotError
				? error
				: new InvalidSnapshotError(paths.snapPath);
		}
	}

	return new Manager({
		recordNewSnapshots,
		updating,
		...paths,
		oldBlocksByTitle: blocksByTitle,
		newBlocksByTitle: updating ? new Map() : blocksByTitle,
		error: snapshotError,
	});
}