// Global test setup
beforeAll(() => {
  // Suppress console.log during tests unless specifically needed
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Restore console methods
  jest.restoreAllMocks();
});

// Add custom matchers if needed
// expect.extend({
//   toBeValidLSPResponse(received) {
//     return { pass: true, message: () => '' };
//   },
// });