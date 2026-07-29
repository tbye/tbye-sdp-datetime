const {
	getOrdinalNumber,
	getISOWeekNumber,
	formatDateTime,
	formatDate,
	formatTime,
	normalizeSettings,
	getTimeoutDelay,
	msUntilNextSecond,
	msUntilNextMinute,
	msUntilNextLocalHour
} = require('./app');

function assertEqual(label, actual, expected) {
	if (actual !== expected) {
		console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
		return false;
	}
	console.log(`PASS ${label}: ${JSON.stringify(actual)}`);
	return true;
}

function assertInRange(label, actual, min, max) {
	if (actual < min || actual > max) {
		console.error(`FAIL ${label}: expected ${min}..${max}, got ${actual}`);
		return false;
	}
	console.log(`PASS ${label}: ${actual} in ${min}..${max}`);
	return true;
}

function testGetOrdinalNumber() {
	const testCases = [
		{ input: 1, expected: '1st' },
		{ input: 2, expected: '2nd' },
		{ input: 3, expected: '3rd' },
		{ input: 4, expected: '4th' },
		{ input: 11, expected: '11th' },
		{ input: 12, expected: '12th' },
		{ input: 13, expected: '13th' },
		{ input: 21, expected: '21st' },
		{ input: 22, expected: '22nd' },
		{ input: 23, expected: '23rd' },
		{ input: 31, expected: '31st' },
		{ input: 0, expected: '0th' },
		{ input: 32, expected: '32nd' }
	];

	let allPassed = true;
	testCases.forEach(({ input, expected }) => {
		if (!assertEqual(`ordinal(${input})`, getOrdinalNumber(input), expected)) {
			allPassed = false;
		}
	});
	return allPassed;
}

function testMsUntilNextSecond() {
	let allPassed = true;
	// Exactly on a second boundary -> wait a full second
	allPassed = assertEqual('msUntilNextSecond@0', msUntilNextSecond(1000), 1000) && allPassed;
	// 250ms into the second -> 750ms remaining
	allPassed = assertEqual('msUntilNextSecond@250', msUntilNextSecond(1250), 750) && allPassed;
	// 999ms into the second -> 1ms remaining
	allPassed = assertEqual('msUntilNextSecond@999', msUntilNextSecond(1999), 1) && allPassed;
	// Never returns 0
	allPassed = assertInRange('msUntilNextSecond never 0', msUntilNextSecond(Date.now()), 1, 1000) && allPassed;
	return allPassed;
}

function testMsUntilNextMinute() {
	let allPassed = true;
	allPassed = assertEqual('msUntilNextMinute@0', msUntilNextMinute(60000), 60000) && allPassed;
	allPassed = assertEqual('msUntilNextMinute@1500', msUntilNextMinute(61500), 58500) && allPassed;
	allPassed = assertEqual('msUntilNextMinute@59999', msUntilNextMinute(119999), 1) && allPassed;
	allPassed = assertInRange('msUntilNextMinute never 0', msUntilNextMinute(Date.now()), 1, 60000) && allPassed;
	return allPassed;
}

function testGetTimeoutDelayAlignment() {
	let allPassed = true;
	// Mid-second: second segment should align to next second, not a fixed 1000
	const midSecond = new Date(1_700_000_000_250); // 250ms into a second
	const secondDelay = getTimeoutDelay(midSecond, 'second');
	allPassed = assertEqual('second delay mid-second', secondDelay, 750) && allPassed;

	// Minute segment should align to minute boundary (not free-run).
	// Construct a known offset into the minute via epoch math.
	const baseMinute = Math.floor(Date.UTC(2026, 5, 24, 12, 0, 0) / 60000) * 60000;
	const midMinute = new Date(baseMinute + 30000); // exactly 30s into a minute
	const minuteDelay = getTimeoutDelay(midMinute, 'minute');
	allPassed = assertEqual('minute delay mid-minute', minuteDelay, 30000) && allPassed;

	// time_no_seconds should also align to the minute (bug class of #10 / multi-tile)
	const tnsDelay = getTimeoutDelay(midMinute, 'time_no_seconds');
	allPassed = assertEqual('time_no_seconds delay mid-minute', tnsDelay, 30000) && allPassed;

	// Full / time show seconds -> second alignment
	allPassed = assertEqual('full delay mid-second', getTimeoutDelay(midSecond, 'full'), 750) && allPassed;

	return allPassed;
}

function testMinuteSecondLockstep() {
	// Simulate the multi-tile case from issue #16: same Date drives both
	// minute and second formatting at the rollover boundary.
	let allPassed = true;
	const justBefore = new Date('2026-06-24T12:00:59.800');
	const justAfter = new Date('2026-06-24T12:01:00.000');

	allPassed = assertEqual('minute @ :59', formatDateTime(justBefore, 'minute'), '00') && allPassed;
	allPassed = assertEqual('second @ :59', formatDateTime(justBefore, 'second'), '59') && allPassed;
	allPassed = assertEqual('minute @ :00', formatDateTime(justAfter, 'minute'), '01') && allPassed;
	allPassed = assertEqual('second @ :00', formatDateTime(justAfter, 'second'), '00') && allPassed;

	// hours_12 midnight / noon edge
	const midnight = new Date('2026-06-24T00:00:00');
	const noon = new Date('2026-06-24T12:00:00');
	allPassed = assertEqual('hours_12 midnight', formatDateTime(midnight, 'hours_12'), '12') && allPassed;
	allPassed = assertEqual('hours_12 noon', formatDateTime(noon, 'hours_12'), '12') && allPassed;

	return allPassed;
}

function testMsUntilNextLocalHour() {
	let allPassed = true;
	// 10:30:00 local -> 30 minutes remaining
	const d = new Date(2026, 5, 24, 10, 30, 0, 0);
	const delay = msUntilNextLocalHour(d);
	allPassed = assertEqual('msUntilNextLocalHour from :30', delay, 30 * 60 * 1000) && allPassed;
	// Exactly on the hour -> full hour
	const onHour = new Date(2026, 5, 24, 11, 0, 0, 0);
	allPassed = assertEqual('msUntilNextLocalHour on hour', msUntilNextLocalHour(onHour), 60 * 60 * 1000) && allPassed;
	return allPassed;
}

function testRegionFormat() {
	// Region / locale format controls from PR #15 (ported)
	let allPassed = true;
	const d = new Date(2026, 5, 24, 15, 4, 7); // June 24, 2026 15:04:07 local

	allPassed = assertEqual('formatDate mm_dd_yyyy', formatDate(d, 'mm_dd_yyyy', true), '06/24/2026') && allPassed;
	allPassed = assertEqual('formatDate dd_mm_yyyy', formatDate(d, 'dd_mm_yyyy', true), '24/06/2026') && allPassed;
	allPassed = assertEqual('formatDate yyyy_mm_dd', formatDate(d, 'yyyy_mm_dd', true), '2026-06-24') && allPassed;
	allPassed = assertEqual('formatDate no year mm_dd', formatDate(d, 'mm_dd_yyyy', false), '06/24') && allPassed;
	// issue #14 — European dotted forms
	const mar27 = new Date(2026, 2, 27, 12, 0, 0); // March 27, 2026
	allPassed = assertEqual('formatDate d_m_yyyy_dot (#14)', formatDate(mar27, 'd_m_yyyy_dot', true), '27.3.2026') && allPassed;
	allPassed = assertEqual('formatDate dd_mm_yyyy_dot', formatDate(mar27, 'dd_mm_yyyy_dot', true), '27.03.2026') && allPassed;
	allPassed = assertEqual('formatDate d_m_yyyy_dot no year', formatDate(mar27, 'd_m_yyyy_dot', false), '27.3') && allPassed;

	allPassed = assertEqual('formatTime 24h + sec', formatTime(d, '24', true, true), '15:04:07') && allPassed;
	allPassed = assertEqual('formatTime 12h + sec + ampm', formatTime(d, '12', true, true), '03:04:07 PM') && allPassed;
	allPassed = assertEqual('formatTime 12h no sec no ampm', formatTime(d, '12', false, false), '03:04') && allPassed;

	const settings = {
		dtsegment: 'date',
		dateformat: 'yyyy_mm_dd',
		hourformat: '24'
	};
	allPassed = assertEqual(
		'formatDateTime settings date',
		formatDateTime(d, settings),
		'2026-06-24'
	) && allPassed;
	allPassed = assertEqual(
		'formatDateTime settings time 24',
		formatDateTime(d, { dtsegment: 'time', dateformat: 'locale', hourformat: '24' }),
		'15:04:07'
	) && allPassed;

	// Legacy string settings still work
	allPassed = assertEqual('formatDateTime legacy string minute', formatDateTime(d, 'minute'), '04') && allPassed;

	const norm = normalizeSettings({ dtsegment: 'time' });
	allPassed = assertEqual('normalize default dateformat', norm.dateformat, 'locale') && allPassed;
	allPassed = assertEqual('normalize default hourformat', norm.hourformat, 'locale') && allPassed;

	return allPassed;
}

function testISOWeekNumber() {
	// Known ISO week values (local calendar Y-M-D, algorithm uses those fields)
	let allPassed = true;
	const cases = [
		// Jan 1 2026 is Thursday → week 1
		{ d: new Date(2026, 0, 1), week: 1 },
		// Jan 4 is always in week 1
		{ d: new Date(2026, 0, 4), week: 1 },
		// 2026-03-26 (around issue #13) — Thursday of week 13
		{ d: new Date(2026, 2, 26), week: 13 },
		// Dec 28 2026 is Monday → week 53 of 2026
		{ d: new Date(2026, 11, 28), week: 53 },
		// Jan 1 2015 Thursday → week 1
		{ d: new Date(2015, 0, 1), week: 1 },
		// Dec 31 2015 Thursday → week 53 of 2015
		{ d: new Date(2015, 11, 31), week: 53 },
		// Jan 1 2016 Friday → still week 53 of 2015 (ISO week-year)
		{ d: new Date(2016, 0, 1), week: 53 },
		// Jan 4 2016 Monday → week 1 of 2016
		{ d: new Date(2016, 0, 4), week: 1 }
	];
	cases.forEach(({ d, week }) => {
		const got = getISOWeekNumber(d);
		const label = `ISO week ${d.toISOString().slice(0, 10)}`;
		if (!assertEqual(label, got, week)) {
			allPassed = false;
		}
	});
	// Segment formatting is zero-padded
	allPassed = assertEqual(
		'week_iso segment pad',
		formatDateTime(new Date(2026, 2, 26), 'week_iso'),
		'13'
	) && allPassed;
	allPassed = assertEqual(
		'week_iso segment pad week 1',
		formatDateTime(new Date(2026, 0, 1), 'week_iso'),
		'01'
	) && allPassed;
	return allPassed;
}

console.log('--- ordinal ---');
const a = testGetOrdinalNumber();
console.log('--- msUntilNextSecond ---');
const b = testMsUntilNextSecond();
console.log('--- msUntilNextMinute ---');
const c = testMsUntilNextMinute();
console.log('--- getTimeoutDelay alignment ---');
const d = testGetTimeoutDelayAlignment();
console.log('--- multi-tile lockstep (issue #16) ---');
const e = testMinuteSecondLockstep();
console.log('--- local hour ---');
const f = testMsUntilNextLocalHour();
console.log('--- region format (PR #15) ---');
const g = testRegionFormat();
function testDayName() {
	// 2026-03-27 is a Friday
	let allPassed = true;
	const fri = new Date(2026, 2, 27, 12, 0, 0);
	const mon = new Date(2026, 2, 23, 12, 0, 0); // Monday
	const sun = new Date(2026, 2, 22, 12, 0, 0); // Sunday

	allPassed = assertEqual('day_name Friday', formatDateTime(fri, 'day_name'), 'Friday') && allPassed;
	allPassed = assertEqual('day_abbrev Friday', formatDateTime(fri, 'day_abbrev'), 'Fri') && allPassed;
	allPassed = assertEqual('day_abbrev Monday (#11)', formatDateTime(mon, 'day_abbrev'), 'Mon') && allPassed;
	allPassed = assertEqual('day_name Sunday', formatDateTime(sun, 'day_name'), 'Sunday') && allPassed;
	allPassed = assertEqual('day_abbrev Sunday', formatDateTime(sun, 'day_abbrev'), 'Sun') && allPassed;

	return allPassed;
}

console.log('--- ISO week number (issue #13) ---');
const h = testISOWeekNumber();
console.log('--- day name (issue #11) ---');
const i = testDayName();

if (a && b && c && d && e && f && g && h && i) {
	console.log('\nAll tests passed!');
	process.exit(0);
} else {
	console.log('\nSome tests failed.');
	process.exit(1);
}
