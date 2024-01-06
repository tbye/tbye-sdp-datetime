/// <reference path="../../../libs/js/property-inspector.js" />
/// <reference path="../../../libs/js/utils.js" />

$PI.onConnected((jsn) => {
    const form = document.querySelector('#property_inspector');
    const {actionInfo, appInfo, connection, messageType, port, uuid} = jsn;
    const {payload, context} = actionInfo;
    const {settings} = payload;

    Utils.setFormValue(settings, form);

    form.addEventListener(
        'input',
        Utils.debounce(150, () => {
            const value = Utils.getFormValue(form);
            $PI.setSettings(value);
        })
    );
});

// Elgato says to do this, but either I'm not doing it right or it doesn't make a difference.
const piwrap = document.querySelector('#piwrap');
piwrap.style.display = "";

window.sendToInspector = (data) => {
    console.log(data);
};

