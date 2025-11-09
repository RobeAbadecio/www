const output = document.getElementById("output");
let total = 0;
let cur = 0;
let operation = 0;
function add() {
    operation = 1;
    total = output.textContent;
    output.textContent = 0;
}
function minus() {
    operation = 2;
    total = output.textContent;
    output.textContent = 0;
}
function times() {
    operation = 3;
    total = output.textContent;
    output.textContent = 0;
}
function divide() {
    operation = 4;
    total = output.textContent;
    output.textContent = 0;
}
function clears() {
    output.textContent = 0;
}
function inZero() {
    output.textContent = output.textContent + 0;
}
function inOne() {
    ifZero()
    output.textContent = output.textContent + 1;
}
function inTwo() {
    ifZero()
    output.textContent = output.textContent + 2;
}
function inThree() {
    ifZero()
    output.textContent = output.textContent + 3;

}
function inFour() {
    ifZero()
    output.textContent = output.textContent + 4;
}
function inFive() {
    ifZero()
    output.textContent = output.textContent + 5;
}
function inSix() {
    ifZero()
    output.textContent = output.textContent + 6;
}
function inSeven() {
    ifZero()
    output.textContent = output.textContent + 7;
}
function inEight() {
    ifZero()
    output.textContent = output.textContent + 8;
}
function inNine() {
    ifZero()
    output.textContent = output.textContent + 9;
}
function decimal() {
    ifZero()
    output.textContent = output.textContent + ".";
}
function ifZero() {
    if (output.textContent == 0) { output.textContent = "" }
}
function equals() {
    if (operation == 1) {
        output.textContent = Number(total) + Number(output.textContent);
    }
    if (operation == 2) {
        output.textContent = Number(total) - Number(output.textContent);
    }
    if (operation == 3) {
        output.textContent = Number(total) * Number(output.textContent);
    }
    if (operation == 4) {
        output.textContent = Number(total) / Number(output.textContent);
    }
    total = 0;
}
