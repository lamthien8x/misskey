const Redis = require('./packages/backend/node_modules/ioredis');
const redis = new Redis({ host: 'localhost', port: 6379 });

async function main() {
    const pkgId = 'HP_afaqrk1d';
    const userId = 'FAKE_USER_001';

    // Create fake contribution
    const contribKey = `help:contrib:${pkgId}:${userId}`;
    const contribData = {
        amount: 50000,
        at: Date.now(),
        paid: true
    };
    await redis.set(contribKey, JSON.stringify(contribData));
    console.log(`Created contrib: ${contribKey}`);

    // Create fake report (so we can test Dismiss/Refund)
    const reportKey = `help:gift:report:${pkgId}:${userId}`;
    const reportData = {
        reason: "Fake report for testing",
        at: Date.now()
    };
    await redis.set(reportKey, JSON.stringify(reportData));
    console.log(`Created report: ${reportKey}`);

    redis.disconnect();
}

main();
