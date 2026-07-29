const {
	getOrdinalNumber,
	formatDateTime,
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

if (a && b && c && d && e && f) {
	console.log('\nAll tests passed!');
	process.exit(0);
} else {
	console.log('\nSome tests failed.');
	process.exit(1);
}
