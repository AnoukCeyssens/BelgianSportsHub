// The one place the I/O shell reads the current time. Domain rules never call
// this; they take `now` as an argument. Tests fix it with fixClock().
export function now(): Date {
  return new Date();
}
