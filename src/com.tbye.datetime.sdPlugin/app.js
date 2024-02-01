/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />


const month_names = [
	"January", "February", "March", "April", "May", "June", 
	"July", "August", "September", "October", "November", "December"
];

const month_abbrev = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun", 
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const myAction = new Action('com.tbye.datetime.action');
myAction.timeout_ids = {};

myAction.onWillAppear(({ action, context, device, event, payload }) => {
	// console.log("onWillAppear was called: context: " + JSON.stringify(context) + " payload: " + JSON.stringify(payload));
	if(payload.settings != null && payload.settings.hasOwnProperty("dtsegment")){
		updateTimer(context, payload.settings.dtsegment);
	} else {
		$SD.setSettings(context, {"dtsegment": "full"});
		updateTimer(context, "full");
	}
});


myAction.onDidReceiveSettings(({ action, context, device, event, payload }) => {
	// console.log("onDidReceiveSettings was called: context: " + context + " payload: " + JSON.stringify(payload));
	updateTimer(context, payload.settings.dtsegment);
});


function updateTimer(context, dtsegment){
	if(!dtsegment){
		// console.log("updateTimer was called with no dtsegment");
		return;
	}
	// console.log("updateTimer was called: " + dtsegment);
	let d = new Date();
	$SD.setTitle(context, formatDateTime(d, dtsegment));
	if(myAction.timeout_ids[context]){
		clearTimeout(myAction.timeout_ids[context]);
	}
	myAction.timeout_ids[context] = setTimeout(updateTimer, getTimeoutDelay(d, dtsegment), context, dtsegment);
}


function formatDateTime(d, dtsegment){
	if(!(d instanceof Date)){
		return "";
	}

	let txt = "";
	switch(dtsegment){
		case "date":
			txt =  "" + d.toLocaleDateString(); 
			break;
		case "date_no_year":
			txt =  "" + d.toLocaleDateString().replace(/\/\d\d\d\d/, "");
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
			txt =  "" + d.toLocaleDateString() + "\n" + d.toLocaleTimeString();
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
