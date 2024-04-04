//// [tests/cases/conformance/es2023/intlNumberFormatES2023.ts] ////

//// [intlNumberFormatES2023.ts]
// New / updated resolved options in ES2023, including type change for useGrouping
const { roundingPriority, roundingMode, roundingIncrement, trailingZeroDisplay, useGrouping } =  new Intl.NumberFormat('en-GB').resolvedOptions();

// Empty options
new Intl.NumberFormat('en-GB', {});

// Rounding
new Intl.NumberFormat('en-GB', { roundingPriority: 'lessPrecision', roundingIncrement: 100, roundingMode: 'trunc' });

// Changes to signDisplay
const { signDisplay } = new Intl.NumberFormat('en-GB', { signDisplay: 'negative' }).resolvedOptions();

// Changes to useGrouping
new Intl.NumberFormat('en-GB', { useGrouping: true });
new Intl.NumberFormat('en-GB', { useGrouping: 'true' });
new Intl.NumberFormat('en-GB', { useGrouping: 'always' });

// formatRange
new Intl.NumberFormat('en-GB').formatRange(10, 100);
new Intl.NumberFormat('en-GB').formatRange(10n, 1000n);
new Intl.NumberFormat('en-GB').formatRangeToParts(10, 1000)[0];
new Intl.NumberFormat('en-GB').formatRangeToParts(10n, 1000n)[0];


//// [intlNumberFormatES2023.js]
"use strict";
// New / updated resolved options in ES2023, including type change for useGrouping
const { roundingPriority, roundingMode, roundingIncrement, trailingZeroDisplay, useGrouping } = new Intl.NumberFormat('en-GB').resolvedOptions();
// Empty options
new Intl.NumberFormat('en-GB', {});
// Rounding
new Intl.NumberFormat('en-GB', { roundingPriority: 'lessPrecision', roundingIncrement: 100, roundingMode: 'trunc' });
// Changes to signDisplay
const { signDisplay } = new Intl.NumberFormat('en-GB', { signDisplay: 'negative' }).resolvedOptions();
// Changes to useGrouping
new Intl.NumberFormat('en-GB', { useGrouping: true });
new Intl.NumberFormat('en-GB', { useGrouping: 'true' });
new Intl.NumberFormat('en-GB', { useGrouping: 'always' });
// formatRange
new Intl.NumberFormat('en-GB').formatRange(10, 100);
new Intl.NumberFormat('en-GB').formatRange(10n, 1000n);
new Intl.NumberFormat('en-GB').formatRangeToParts(10, 1000)[0];
new Intl.NumberFormat('en-GB').formatRangeToParts(10n, 1000n)[0];