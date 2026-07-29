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

const DEFAULT_SETTINGS = {
	dtsegment: "full",
	dateformat: "locale",
	hourformat: "locale"
};

// Active button instances: context -> normalized settings object
const activeContexts = {};
let sharedTickTimeoutId = null;

// Only initialize Stream Deck plugin if not in Node.js environment
let myAction;
if (!isNodeJS && typeof Action !== 'undefined') {
	console.log('Initializing DateTime plugin...');
	myAction = new Action('com.tbye.datetime.action');

	myAction.onWillAppear(({ action, context, device, event, payload }) => {
		const settings = normalizeSettings(payload.settings);
		// Persist defaults when a brand-new tile has no settings yet
		if (!payload.settings || !payload.settings.dtsegment) {
			$SD.setSettings(context, settings);
		}
		registerContext(context, settings);
	});

	myAction.onWillDisappear(({ context }) => {
		unregisterContext(context);
	});

	myAction.onDidReceiveSettings(({ action, context, device, event, payload }) => {
		registerContext(context, payload.settings);
	});
}

/**
 * Normalize settings from a string (legacy), partial object, or full object.
 * Region-format fields (dateformat / hourformat) contributed via PR #15.
 */
function normalizeSettings(settings) {
	if (!settings) {
		return Object.assign({}, DEFAULT_SETTINGS);
	}
	if (typeof settings === 'string') {
		return {
			dtsegment: settings,
			dateformat: DEFAULT_SETTINGS.dateformat,
			hourformat: DEFAULT_SETTINGS.hourformat
		};
	}
	return {
		dtsegment: settings.dtsegment || DEFAULT_SETTINGS.dtsegment,
		dateformat: settings.dateformat || DEFAULT_SETTINGS.dateformat,
		hourformat: settings.hourformat || DEFAULT_SETTINGS.hourformat
	};
}

/**
 * Register (or re-register) a button context and paint it immediately
 * from the same wall clock used by every other tile.
 */
function registerContext(context, settings) {
	const normalized = normalizeSettings(settings);
	if (!normalized.dtsegment) {
		return;
	}
	activeContexts[context] = normalized;
	if (!isNodeJS && typeof $SD !== 'undefined') {
		// Immediate paint so the key isn't blank until the next tick
		$SD.setTitle(context, formatDateTime(new Date(), normalized));
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
		const settings = activeContexts[context];
		if (typeof $SD !== 'undefined') {
			$SD.setTitle(context, formatDateTime(d, settings));
		}
	}

	scheduleSharedTick();
}

// Back-compat entry point used by older call sites / mental model.
// Prefer registerContext for new code. Accepts string or settings object.
function updateTimer(context, settings) {
	registerContext(context, settings);
}

/**
 * Explicit date layout (region format). Ported from PR #15 by @lupus2k.
 */
function formatDate(d, dateformat, includeYear) {
	const dayNum = d.getDate();
	const monthNum = d.getMonth() + 1;
	const day = dayNum.toString().padStart(2, "0");
	const month = monthNum.toString().padStart(2, "0");
	const year = d.getFullYear().toString();
	switch (dateformat) {
		case "mm_dd_yyyy":
			return includeYear ? `${month}/${day}/${year}` : `${month}/${day}`;
		case "dd_mm_yyyy":
			return includeYear ? `${day}/${month}/${year}` : `${day}/${month}`;
		case "yyyy_mm_dd":
			return includeYear ? `${year}-${month}-${day}` : `${month}-${day}`;
		// European dotted forms (issue #14): 27.3.2026 and 27.03.2026
		case "d_m_yyyy_dot":
			return includeYear
				? `${dayNum}.${monthNum}.${year}`
				: `${dayNum}.${monthNum}`;
		case "dd_mm_yyyy_dot":
			return includeYear ? `${day}.${month}.${year}` : `${day}.${month}`;
		default: // "locale"
			return includeYear
				? d.toLocaleDateString()
				: d.toLocaleDateString().replace(/\/\d\d\d\d/, "");
	}
}

/**
 * Explicit time layout (region format). Ported from PR #15 by @lupus2k.
 */
function formatTime(d, hourformat, showSeconds, showAmPm) {
	const hours24 = d.getHours();
	const hours12 = (hours24 % 12) || 12;
	const minutes = d.getMinutes().toString().padStart(2, "0");
	const seconds = d.getSeconds().toString().padStart(2, "0");
	const ampm = hours24 < 12 ? "AM" : "PM";

	if (hourformat === "12") {
		let t = `${hours12.toString().padStart(2, "0")}:${minutes}`;
		if (showSeconds) {
			t += `:${seconds}`;
		}
		if (showAmPm) {
			t += ` ${ampm}`;
		}
		return t;
	}
	if (hourformat === "24") {
		let t = `${hours24.toString().padStart(2, "0")}:${minutes}`;
		if (showSeconds) {
			t += `:${seconds}`;
		}
		return t;
	}
	// "locale"
	let t = d.toLocaleTimeString();
	if (!showSeconds) {
		t = t.replace(/:\d{2}(\s+[AP]M)?$/i, "$1");
	}
	if (!showAmPm) {
		t = t.replace(/\s*[AP]M$/i, "");
	}
	return t.trim();
}

/**
 * Format a Date for a button title.
 * `settings` may be a legacy segment string or a full settings object.
 */
function formatDateTime(d, settings) {
	if (!(d instanceof Date)) {
		return "";
	}

	const { dtsegment, dateformat, hourformat } = normalizeSettings(settings);

	let txt = "";
	switch (dtsegment) {
		case "date":
			txt = formatDate(d, dateformat, true);
			break;
		case "date_no_year":
			txt = formatDate(d, dateformat, false);
			break;
		case "time":
			txt = formatTime(d, hourformat, true, true);
			break;
		case "time_no_seconds":
			txt = formatTime(d, hourformat, false, true);
			break;
		case "time_no_seconds_ampm":
			txt = formatTime(d, hourformat, false, false);
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
			txt = formatDate(d, dateformat, true) + "\n" + formatTime(d, hourformat, true, true);
			break;
	}
	return txt;
}

/**
 * Delay until the next meaningful boundary for a segment.
 * Kept for tests and any future per-context scheduling; the live plugin
 * uses the shared second tick instead.
 * Accepts a segment string or settings object.
 */
function getTimeoutDelay(d, settingsOrSegment) {
	const dtsegment = (typeof settingsOrSegment === 'string')
		? settingsOrSegment
		: normalizeSettings(settingsOrSegment).dtsegment;
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
		formatDate,
		formatTime,
		normalizeSettings,
		getTimeoutDelay,
		msUntilNextSecond,
		msUntilNextMinute,
		msUntilNextLocalHour
	};
}
