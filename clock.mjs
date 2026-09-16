/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;

var timeIndex = initTime();
function initTime(){
	var timezoneDate = new Date();
	var time_zone = -timezoneDate.getTimezoneOffset()/60;
    var offset = 8 - time_zone;

	var date = new Date();
	var days;
	if((date.getDay() > 2 || date.getDay() == 2 && date.getHours() > 5)
		&& (date.getDay() < 6 || date.getDay() == 6 && date.getHours() < 5)){
		days = 6 - date.getDay();
	}
	else{
		if(date.getDay() > 5)
			days = 9 - date.getDay();
		else
			days = 2 - date.getDay();
	}
	var h = days * 24 - date.getHours() - 1 + 5 - offset;
	var m = 60 - date.getMinutes() - 1;
	var s = 60 - date.getSeconds();

	return h * 3600 + m * 60 + s;
};
setTime();
setInterval(setTime, 1000);
function setTime() {
	var hour = Math.trunc(timeIndex / 3600);
	var minutes = Math.trunc((timeIndex % 3600) / 60);
	var seconds = Math.trunc(timeIndex % 60);
	var hourText = hour < 10 ? "0" + hour : String(hour);
	var minutesText = minutes < 10 ? "0" + minutes : String(minutes);
	var secondsText = seconds < 10 ? "0" + seconds : String(seconds);
	if(hour < 36)
		Dom("#showTime").html("<red>" + hourText + ":" + minutesText + ":" + secondsText + "</red>");
	else
		Dom("#showTime").html(hourText + ":" + minutesText + ":" + secondsText);
	timeIndex--;
}

export { initTime, setTime };
