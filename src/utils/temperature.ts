export function fToC(fahrenheit: number) {
  return parseFloat(((fahrenheit - 32) * 5 / 9).toFixed(1));
}

export function cToF(celsius: number) {
  return Math.round(celsius * 9 / 5 + 32);
}
