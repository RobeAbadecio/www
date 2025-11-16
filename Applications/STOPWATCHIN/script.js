const display = document.getElementById("output");

let timer = null;
let startTime = 0;
let elapse = 0;
let isRunning = false;
function start() {
    if (!isRunning) {
        isRunning = true;
        startTime = Date.now() - elapse;
        timer = setInterval(update, 1);
    }
}
function stop() {
    clearInterval(timer);
    isRunning = false;
}
function reset() {
    timer = clearInterval(timer);
    startTime = 0;
    elapse = 0;
    isRunning = false;
    display.textContent = "00:00:00:00"
}
function update() {
    const curTime = Date.now();
    elapse = curTime - startTime;
    let ms = elapse % 1000 / 10;
    let secs = elapse / 1000 % 60;
    let mins = elapse / 60000 % 60;
    let hrs = elapse / 3600000 % 60;
    hrs = String(Math.floor(hrs)).padStart(2, 0);
    secs = String(Math.floor(secs)).padStart(2, 0);
    mins = String(Math.floor(mins)).padStart(2, 0);
    ms = String(Math.floor(ms)).padStart(2, 0);
    display.textContent = hrs + ":" + mins + ":" + secs + ":" + ms;
}