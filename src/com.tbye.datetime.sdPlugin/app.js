/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />

// Check if we're running in Node.js environment (for testing)
const isNodeJS = typeof module !== 'undefined' && typeof module.exports !== 'undefined';

const DEFAULT_SETTINGS = {
	dtsegment: "full",
	dateformat: "locale",
	hourformat: "locale",
	// "locale" = host system language; otherwise a BCP 47 tag (issue #7)
	language: "locale"
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

	// Issue #5: copy the current segment value to the system clipboard on press.
	// Works in multi-actions (copy here, then paste / type with a later step).
	myAction.onKeyDown(({ action, context, device, event, payload }) => {
		const settings = activeContexts[context]
			|| normalizeSettings(payload && payload.settings);
		const text = getClipboardText(settings, new Date());
		copyTextToClipboard(text).then((ok) => {
			if (ok) {
				showOk(context);
			} else {
				showAlert(context);
			}
		});
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
			hourformat: DEFAULT_SETTINGS.hourformat,
			language: DEFAULT_SETTINGS.language
		};
	}
	return {
		dtsegment: settings.dtsegment || DEFAULT_SETTINGS.dtsegment,
		dateformat: settings.dateformat || DEFAULT_SETTINGS.dateformat,
		hourformat: settings.hourformat || DEFAULT_SETTINGS.hourformat,
		language: settings.language || DEFAULT_SETTINGS.language
	};
}

/**
 * Resolve settings.language to an Intl locale argument.
 * "locale" / empty → undefined (runtime default language).
 */
function resolveLocale(language) {
	if (!language || language === "locale" || language === "system") {
		return undefined;
	}
	return language;
}

/**
 * Localized weekday name via Intl (issue #7).
 * @param {"long"|"short"|"narrow"} style
 */
function formatWeekday(d, language, style) {
	const locale = resolveLocale(language);
	try {
		return new Intl.DateTimeFormat(locale, { weekday: style || "long" }).format(d);
	} catch (e) {
		return new Intl.DateTimeFormat(undefined, { weekday: style || "long" }).format(d);
	}
}

/**
 * Localized month name via Intl (issue #7).
 * @param {"long"|"short"|"narrow"|"numeric"|"2-digit"} style
 */
function formatMonthName(d, language, style) {
	const locale = resolveLocale(language);
	try {
		return new Intl.DateTimeFormat(locale, { month: style || "long" }).format(d);
	} catch (e) {
		return new Intl.DateTimeFormat(undefined, { month: style || "long" }).format(d);
	}
}

/**
 * Localized AM/PM (or locale dayPeriod) via Intl.
 */
function formatAmPm(d, language) {
	const locale = resolveLocale(language);
	try {
		const parts = new Intl.DateTimeFormat(locale, {
			hour: "numeric",
			hour12: true
		}).formatToParts(d);
		const period = parts.find((p) => p.type === "dayPeriod");
		if (period && period.value) {
			return period.value;
		}
	} catch (e) {
		// fall through
	}
	return d.getHours() < 12 ? "AM" : "PM";
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
 * Text placed on the clipboard for the current segment (same as key title).
 */
function getClipboardText(settings, d) {
	const date = (d instanceof Date) ? d : new Date();
	return formatDateTime(date, settings);
}

/**
 * Copy plain text to the system clipboard.
 * Prefers the async Clipboard API; falls back to execCommand for older CEF.
 * @returns {Promise<boolean>} true if the write appears to have succeeded
 */
function copyTextToClipboard(text) {
	const value = (text == null) ? "" : String(text);

	if (typeof navigator !== 'undefined'
		&& navigator.clipboard
		&& typeof navigator.clipboard.writeText === 'function') {
		return navigator.clipboard.writeText(value)
			.then(() => true)
			.catch(() => fallbackCopyText(value));
	}
	return Promise.resolve(fallbackCopyText(value));
}

function fallbackCopyText(text) {
	if (typeof document === 'undefined') {
		return false;
	}
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.top = '0';
		ta.style.left = '-9999px';
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		ta.setSelectionRange(0, ta.value.length);
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return !!ok;
	} catch (e) {
		return false;
	}
}

function showOk(context) {
	if (typeof $SD === 'undefined') {
		return;
	}
	if (typeof $SD.showOk === 'function') {
		$SD.showOk(context);
	} else if ($SD.api && typeof $SD.api.showOk === 'function') {
		$SD.api.showOk(context);
	}
}

function showAlert(context) {
	if (typeof $SD === 'undefined') {
		return;
	}
	if (typeof $SD.showAlert === 'function') {
		$SD.showAlert(context);
	} else if ($SD.api && typeof $SD.api.showAlert === 'function') {
		$SD.api.showAlert(context);
	}
}

/**
 * Explicit date layout (region format). Ported from PR #15 by @lupus2k.
 * @param {string} [language] settings.language — affects "locale" dateformat only
 */
function formatDate(d, dateformat, includeYear, language) {
	const dayNum = d.getDate();
	const monthNum = d.getMonth() + 1;
	const day = dayNum.toString().padStart(2, "0");
	const month = monthNum.toString().padStart(2, "0");
	const year = d.getFullYear().toString();
	const locale = resolveLocale(language);
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
		default: // "locale" — use Intl options so year omission works for all locales
			// (issue #6: regex /\/\d\d\d\d/ only matched US-style trailing /YYYY)
			try {
				return includeYear
					? d.toLocaleDateString(locale)
					: d.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
			} catch (e) {
				return includeYear
					? d.toLocaleDateString()
					: d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
			}
	}
}

/**
 * Explicit time layout (region format). Ported from PR #15 by @lupus2k.
 * @param {string} [language] settings.language — affects "locale" hourformat and AM/PM
 */
function formatTime(d, hourformat, showSeconds, showAmPm, language) {
	const hours24 = d.getHours();
	const hours12 = (hours24 % 12) || 12;
	const minutes = d.getMinutes().toString().padStart(2, "0");
	const seconds = d.getSeconds().toString().padStart(2, "0");
	const ampm = formatAmPm(d, language);
	const locale = resolveLocale(language);

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
	let t;
	try {
		t = d.toLocaleTimeString(locale);
	} catch (e) {
		t = d.toLocaleTimeString();
	}
	if (!showSeconds) {
		// Strip trailing :SS or :SS before AM/PM (same robust pattern as #10/#12)
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

	const { dtsegment, dateformat, hourformat, language } = normalizeSettings(settings);

	let txt = "";
	switch (dtsegment) {
		case "date":
			txt = formatDate(d, dateformat, true, language);
			break;
		case "date_no_year":
			txt = formatDate(d, dateformat, false, language);
			break;
		case "time":
			txt = formatTime(d, hourformat, true, true, language);
			break;
		case "time_no_seconds":
			txt = formatTime(d, hourformat, false, true, language);
			break;
		case "time_no_seconds_ampm":
			txt = formatTime(d, hourformat, false, false, language);
			break;
		case "day":
			txt = "" + (d.getDate()).toString().padStart(2, "0");
			break;
		case "day_ordinal":
			txt = getOrdinalNumber((d.getDate()).toString().padStart(2, "0"));
			break;
		case "day_name":
			txt = formatWeekday(d, language, "long");
			break;
		case "day_abbrev":
			// e.g. Mon, Tue, Wed (issue #11) — localized (issue #7)
			txt = formatWeekday(d, language, "short");
			break;
		case "month":
			txt = "" + (d.getMonth() + 1).toString().padStart(2, "0");
			break;
		case "month_name":
			txt = formatMonthName(d, language, "long");
			break;
		case "month_abbrev":
			txt = formatMonthName(d, language, "short");
			break;
		case "year":
			txt = "" + d.getFullYear();
			break;
		case "week_iso":
			// ISO 8601 week number (1–53), zero-padded
			txt = getISOWeekNumber(d).toString().padStart(2, "0");
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
			txt = formatAmPm(d, language);
			break;
		default: // handles "full"
			txt = formatDate(d, dateformat, true, language) + "\n"
				+ formatTime(d, hourformat, true, true, language);
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
		case "day_name":
		case "day_abbrev":
		case "date":
		case "date_no_year":
		case "month":
		case "month_name":
		case "month_abbrev":
		case "year":
		case "week_iso":
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

/**
 * ISO 8601 week number (1–53).
 * Weeks start on Monday; week 1 is the week that contains the year's first Thursday
 * (equivalently, the week containing 4 January).
 * @see https://en.wikipedia.org/wiki/ISO_week_date
 */
function getISOWeekNumber(d) {
	// Work in UTC from Y-M-D so local DST does not shift the calendar day
	const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	// ISO: Sunday=7; set to nearest Thursday (which defines the ISO week-year)
	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// Export for Node.js testing
if (isNodeJS) {
	module.exports = {
		getOrdinalNumber,
		getISOWeekNumber,
		formatDateTime,
		formatDate,
		formatTime,
		formatWeekday,
		formatMonthName,
		formatAmPm,
		resolveLocale,
		normalizeSettings,
		getClipboardText,
		copyTextToClipboard,
		fallbackCopyText,
		getTimeoutDelay,
		msUntilNextSecond,
		msUntilNextMinute,
		msUntilNextLocalHour
	};
}
