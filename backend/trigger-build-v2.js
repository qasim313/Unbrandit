const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();
const connection = {
    url: process.env.REDIS_URL || 'redis://redis:6379'
};
const buildQueue = new Queue('builds', { connection });

async function trigger() {
    const flavorId = 'cmltx7hs10004me017mrzfway';
    const sourceUrl = 'https://unbranditstore.blob.core.windows.net/apk-whitelabel-uploads/apk/47b2d649-5626-4260-ba2d-b5cfa36846d7-novusschool-debug%20(2).apk';

    const flavor = await prisma.flavor.findUnique({
        where: { id: flavorId },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!flavor) {
        console.error('Flavor not found');
        process.exit(1);
    }

    const version = flavor.versions[0];

    const build = await prisma.build.create({
        data: {
            flavorId,
            flavorVersionId: version?.id,
            status: 'QUEUED',
            sourceUrl,
            sourceType: 'APK',
            buildType: 'APK'
        }
    });

    console.log('Created build:', build.id, 'linked to version:', version?.id);

    await buildQueue.add('build', {
        buildId: build.id,
        flavorId,
        buildType: 'APK',
        sourceUrl,
        sourceType: 'APK',
        config: flavor.configJson
    });

    console.log('Added to queue');
    process.exit(0);
}

trigger();
