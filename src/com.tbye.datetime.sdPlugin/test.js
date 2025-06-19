const getOrdinalNumber = require('./app');

function testGetOrdinalNumber() {
    const testCases = [
        { input: 1, expected: '1st' },
        { input: 2, expected: '2nd' },
        { input: 3, expected: '3rd' },
        { input: 4, expected: '4th' },
        { input: 11, expected: '11th' },
        { input: 12, expected: '12th' },
        { input: 13, expected: '13th' },
        { input: 21, expected: '21st' },
        { input: 22, expected: '22nd' },
        { input: 23, expected: '23rd' },        { input: 31, expected: '31st' },
        { input: 0, expected: '0th' }, // Optional: Handle invalid input
        { input: 32, expected: '32nd' } // Optional: Out-of-range input
    ];

    let allPassed = true;

    testCases.forEach(({ input, expected }) => {
        const result = getOrdinalNumber(input);
        if (result !== expected) {
            console.error(`Test failed for input ${input}: expected "${expected}", got "${result}"`);
            allPassed = false;
        } else {
            console.log(`Test passed for input ${input}: "${result}"`);
        }
    });

    if (allPassed) {
        console.log("All tests passed!");
    } else {
        console.log("Some tests failed.");
    }
}

// Run the test suite
testGetOrdinalNumber();