/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />

// Check if we're running in Node.js environment (for testing)
const isNodeJS = typeof module !== 'undefined' && typeof module.exports !== 'undefined';

const month_names = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"
];

const month_abbrev = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// Active button instances: context -> dtsegment
const activeContexts = {};
let sharedTickTimeoutId = null;

// Only initialize Stream Deck plugin if not in Node.js environment
let myAction;
if (!isNodeJS && typeof Action !== 'undefined') {
	console.log('Initializing DateTime plugin...');
	myAction = new Action('com.tbye.datetime.action');

	myAction.onWillAppear(({ action, context, device, event, payload }) => {
		const segment = (payload.settings && payload.settings.dtsegment)
			? payload.settings.dtsegment
			: "full";
		if (!payload.settings || !payload.settings.dtsegment) {
			$SD.setSettings(context, {"dtsegment": "full"});
		}
		registerContext(context, segment);
	});

	myAction.onWillDisappear(({ context }) => {
		unregisterContext(context);
	});

	myAction.onDidReceiveSettings(({ action, context, device, event, payload }) => {
		registerContext(context, payload.settings.dtsegment);
	});
}

/**
 * Register (or re-register) a button context and paint it immediately
 * from the same wall clock used by every other tile.
 */
function registerContext(context, dtsegment) {
	if (!dtsegment) {
		return;
	}
	activeContexts[context] = dtsegment;
	if (!isNodeJS && typeof $SD !== 'undefined') {
		// Immediate paint so the key isn't blank until the next tick
		$SD.setTitle(context, formatDateTime(new Date(), dtsegment));
		ensureSharedTick();
	}
}

function unregisterContext(context) {
	delete activeContexts[context];
	if (Object.keys(activeContexts).length === 0 && sharedTickTimeoutId != null) {
		clearTimeout(sharedTickTimeoutId);
		sharedTickTimeoutId = null;
	}
}

/**
 * Milliseconds until the next whole-second boundary on the wall clock.
 * Always returns a value in 1..1000 so setTimeout never gets 0.
 */
function msUntilNextSecond(nowMs) {
	const now = (typeof nowMs === 'number') ? nowMs : Date.now();
	const intoSecond = now % 1000;
	return intoSecond === 0 ? 1000 : (1000 - intoSecond);
}

/**
 * Milliseconds until the next whole-minute boundary on the wall clock.
 * Always returns a value in 1..60000.
 */
function msUntilNextMinute(nowMs) {
	const now = (typeof nowMs === 'number') ? nowMs : Date.now();
	const intoMinute = now % 60000;
	return intoMinute === 0 ? 60000 : (60000 - intoMinute);
}

/**
 * Milliseconds until the next local-hour boundary (handles DST correctly
 * by using calendar fields, not epoch modulo).
 */
function msUntilNextLocalHour(d) {
	const date = (d instanceof Date) ? d : new Date(d);
	const next = new Date(date.getTime());
	next.setSeconds(0, 0);
	next.setMinutes(0);
	next.setHours(next.getHours() + 1);
	const delay = next.getTime() - date.getTime();
	return delay <= 0 ? 1 : delay;
}

function ensureSharedTick() {
	if (sharedTickTimeoutId != null) {
		return;
	}
	scheduleSharedTick();
}

function scheduleSharedTick() {
	if (sharedTickTimeoutId != null) {
		clearTimeout(sharedTickTimeoutId);
	}
	// Align every fire to the next wall-clock second. Recomputing from
	// Date.now() each time prevents setTimeout drift from accumulating.
	const delay = msUntilNextSecond();
	sharedTickTimeoutId = setTimeout(onSharedTick, delay);
}

function onSharedTick() {
	sharedTickTimeoutId = null;
	const contexts = Object.keys(activeContexts);
	if (contexts.length === 0) {
		return;
	}

	// ONE Date for every tile this tick — multi-tile clocks stay in lockstep.
	// Always paint every active context (even minute/hour segments). A few
	// setTitle calls per second is cheap, and it means a late/skipped tick
	// after sleep still converges on the correct value on the next fire.
	const d = new Date();
	for (let i = 0; i < contexts.length; i++) {
		const context = contexts[i];
		const segment = activeContexts[context];
		if (typeof $SD !== 'undefined') {
			$SD.setTitle(context, formatDateTime(d, segment));
		}
	}

	scheduleSharedTick();
}

// Back-compat entry point used by older call sites / mental model.
// Prefer registerContext for new code.
function updateTimer(context, dtsegment) {
	registerContext(context, dtsegment);
}

function formatDateTime(d, dtsegment) {
	if (!(d instanceof Date)) {
		return "";
	}

	let txt = "";
	switch (dtsegment) {
		case "date":
			txt = "" + d.toLocaleDateString();
			break;
		case "date_no_year":
			txt = "" + d.toLocaleDateString().replace(/\/\d\d\d\d/, "");
			break;
		case "time":
			txt = "" + d.toLocaleTimeString();
			break;
		case "time_no_seconds":
			txt = "" + d.toLocaleTimeString().replace(/:\d\d /, " ");
			break;
		case "time_no_seconds_ampm":
			txt = "" + d.toLocaleTimeString().replace(/:\d\d /, " ").replace(/ [AP]M/, "");
			break;
		case "day":
			txt = "" + (d.getDate()).toString().padStart(2, "0");
			break;
		case "day_ordinal":
			txt = getOrdinalNumber((d.getDate()).toString().padStart(2, "0"));
			break;
		case "month":
			txt = "" + (d.getMonth() + 1).toString().padStart(2, "0");
			break;
		case "month_name":
			txt = month_names[d.getMonth()];
			break;
		case "month_abbrev":
			txt = month_abbrev[d.getMonth()];
			break;
		case "year":
			txt = "" + d.getFullYear();
			break;
		case "hours_12": {
			let h = d.getHours() % 12;
			if (h === 0) {
				h = 12;
			}
			txt = h.toString().padStart(2, "0");
			break;
		}
		case "hours_24":
			txt = "" + (d.getHours()).toString().padStart(2, "0");
			break;
		case "minute":
			txt = "" + d.getMinutes().toString().padStart(2, "0");
			break;
		case "second":
			txt = "" + d.getSeconds().toString().padStart(2, "0");
			break;
		case "ampm":
			txt = d.getHours() < 12 ? "AM" : "PM";
			break;
		default: // handles "full"
			txt = "" + d.toLocaleDateString() + "\n" + d.toLocaleTimeString();
			break;
	}
	return txt;
}

/**
 * Delay until the next meaningful boundary for a segment.
 * Kept for tests and any future per-context scheduling; the live plugin
 * uses the shared second tick instead.
 */
function getTimeoutDelay(d, dtsegment) {
	const now = d.getTime();
	switch (dtsegment) {
		case "second":
		case "time":
		case "full":
			return msUntilNextSecond(now);
		case "minute":
		case "time_no_seconds":
		case "time_no_seconds_ampm":
			return msUntilNextMinute(now);
		case "hours_12":
		case "hours_24":
		case "day":
		case "day_ordinal":
		case "date":
		case "date_no_year":
		case "month":
		case "month_name":
		case "month_abbrev":
		case "year":
		case "ampm":
			return msUntilNextLocalHour(d);
		default:
			return msUntilNextSecond(now);
	}
}

function getOrdinalNumber(day) {
	const suffixes = ['th', 'st', 'nd', 'rd'];
	const v = day % 10; // Get the last digit of the day
	const suffix = (day % 100 >= 11 && day % 100 <= 13) ? suffixes[0] : (suffixes[v] || suffixes[0]);
	return `${day}${suffix}`;
}

// Export for Node.js testing
if (isNodeJS) {
	module.exports = {
		getOrdinalNumber,
		formatDateTime,
		getTimeoutDelay,
		msUntilNextSecond,
		msUntilNextMinute,
		msUntilNextLocalHour
	};
}
