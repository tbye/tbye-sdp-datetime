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

// Only initialize Stream Deck plugin if not in Node.js environment
let myAction;
if (!isNodeJS && typeof Action !== 'undefined') {
	console.log('Initializing DateTime plugin...');
	myAction = new Action('com.tbye.datetime.action');
	myAction.timeout_ids = {};

	myAction.onWillAppear(({ action, context, device, event, payload }) => {
		// console.log("onWillAppear was called: context: " + JSON.stringify(context) + " payload: " + JSON.stringify(payload));
		if(payload.settings != null && payload.settings.hasOwnProperty("dtsegment")){
			updateTimer(context, payload.settings);
		} else {
			const defaultSettings = {"dtsegment": "full", "dateformat": "locale", "hourformat": "locale"};
			$SD.setSettings(context, defaultSettings);
			updateTimer(context, defaultSettings);
		}
	});

	myAction.onDidReceiveSettings(({ action, context, device, event, payload }) => {
		// console.log("onDidReceiveSettings was called: context: " + context + " payload: " + JSON.stringify(payload));
		updateTimer(context, payload.settings);
	});
}

function updateTimer(context, settings){
	if(!isNodeJS && !settings){
		// console.log("updateTimer was called with no settings");
		return;
	}
	// console.log("updateTimer was called: " + JSON.stringify(settings));
	const dtsegment = typeof settings === 'string' ? settings : settings.dtsegment;
	let d = new Date();
	if (!isNodeJS && typeof $SD !== 'undefined') {
		$SD.setTitle(context, formatDateTime(d, settings));
		if(myAction.timeout_ids[context]){
			clearTimeout(myAction.timeout_ids[context]);
		}
		myAction.timeout_ids[context] = setTimeout(updateTimer, getTimeoutDelay(d, dtsegment), context, settings);
	}
}


function formatDate(d, dateformat, includeYear) {
	const day = d.getDate().toString().padStart(2, "0");
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	const year = d.getFullYear().toString();
	switch(dateformat) {
		case "mm_dd_yyyy":
			return includeYear ? `${month}/${day}/${year}` : `${month}/${day}`;
		case "dd_mm_yyyy":
			return includeYear ? `${day}/${month}/${year}` : `${day}/${month}`;
		case "yyyy_mm_dd":
			return includeYear ? `${year}-${month}-${day}` : `${month}-${day}`;
		default: // "locale"
			return includeYear ? d.toLocaleDateString() : d.toLocaleDateString().replace(/\/\d\d\d\d/, "");
	}
}

function formatTime(d, hourformat, showSeconds, showAmPm) {
	const hours24 = d.getHours();
	const hours12 = (hours24 % 12) || 12;
	const minutes = d.getMinutes().toString().padStart(2, "0");
	const seconds = d.getSeconds().toString().padStart(2, "0");
	const ampm = hours24 < 12 ? "AM" : "PM";

	if (hourformat === "12") {
		let t = `${hours12.toString().padStart(2, "0")}:${minutes}`;
		if (showSeconds) t += `:${seconds}`;
		if (showAmPm) t += ` ${ampm}`;
		return t;
	} else if (hourformat === "24") {
		let t = `${hours24.toString().padStart(2, "0")}:${minutes}`;
		if (showSeconds) t += `:${seconds}`;
		return t;
	} else { // "locale"
		let t = d.toLocaleTimeString();
		if (!showSeconds) {
			t = t.replace(/:\d{2}(\s+[AP]M)?$/i, "$1");
		}
		if (!showAmPm) {
			t = t.replace(/\s*[AP]M$/i, "");
		}
		return t.trim();
	}
}

function formatDateTime(d, settings){
	if(!(d instanceof Date)){
		return "";
	}

	// Support both old-style string and new-style settings object
	let dtsegment, dateformat, hourformat;
	if (typeof settings === 'string') {
		dtsegment = settings;
		dateformat = "locale";
		hourformat = "locale";
	} else {
		dtsegment = settings.dtsegment;
		dateformat = settings.dateformat || "locale";
		hourformat = settings.hourformat || "locale";
	}

	let txt = "";
	switch(dtsegment){
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
			txt = "" + (d.getMonth()+1).toString().padStart(2, "0");
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
		case "hours_12":
			h = d.getHours();
			if(h > 12){
				h -= 12;
			}
			txt = h.toString().padStart(2, "0");
			break;
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
			// console.log("default case, full?");
			txt = formatDate(d, dateformat, true) + "\n" + formatTime(d, hourformat, true, true);
			break;
	}
	return txt;
}


function getTimeoutDelay(d, dtsegment){
	let now = d.getTime(); // current time in milliseconds
	let delay = 1000;
	switch(dtsegment){
		case "second":
		case "time":
		case "full":
			// All show seconds so we update every second
			delay = 1000;
			break;
		case "minute":
			const oneMinute = 60 * 1000; // one minute in milliseconds
			delay = oneMinute - (now % oneMinute); // time until next minute
			break;
		case "hours_12":
		case "hours_24":
		case "day":
		case "month":
		case "month_name":
		case "month_abbrev":
		case "year":
		case "ampm":
			// everything should try and update every hour - currently elapsed milliseconds	
			const oneHour = 60 * 60 * 1000; // one hour in milliseconds
    		delay = oneHour - (now % oneHour); // time until next hour
    		break;
	}
	return delay;
}

function getOrdinalNumber(day) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = day % 10; // Get the last digit of the day
    const suffix = (day % 100 >= 11 && day % 100 <= 13) ? suffixes[0] : (suffixes[v] || suffixes[0]);
    return `${day}${suffix}`;
}

// Export for Node.js testing
if (isNodeJS) {
    module.exports = getOrdinalNumber;
}