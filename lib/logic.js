'use strict';

/**
 * When fish is caught this transaction shoud get executed
 * @param {hr.foi.fishynet.CatchFish} fish caught transaction
 * @transaction
 */
async function catchFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const factory = getFactory();

    const fish = factory.newResource(NS, 'Fish', tx.fishId);
    fish.type = 'TUNA_WILD';
    fish.state = 'STORED';
    fish.fisher = factory.newRelationship(NS, 'Fisher', tx.fisher.getIdentifier());
    fish.owner = factory.newRelationship(NS, 'Fisher', tx.fisher.getIdentifier());

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.add(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent(NS, 'FishKilled');
    event.fish = fish;
    event.fisher = tx.fisher;
    emit(event);
}

/**
 * When fish is born this transaction should get executed
 * @param {hr.foi.fishynet.ProduceFish} fish born transaction
 * @transaction
 */
async function produceFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const factory = getFactory();

    const fish = factory.newResource(NS, 'Fish', tx.fishId);
    fish.type = 'TUNA_FARM';
    fish.state = 'ALIVE';
    fish.fisher = factory.newRelationship(NS, 'Fisher', tx.fisher.getIdentifier());
    fish.source = tx;

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.add(fish);
}

/**
 * When fish is killed this transaction should get executed
 * @param {hr.foi.fishynet.KillFish} fish killed transaction
 * @transaction
 */
async function killFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;

    fish.state = 'STORED';
    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.update(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent(NS, 'FishKilled');
    event.fish = fish;
    emit(event);
}

/**
 * When fish is meassured for fat or weight this transaction should get executed
 * @param {hr.foi.fishynet.MeasureFish} fish meassure transaction
 * @transaction
 */
async function measureFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;

    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.update(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent(NS, 'FishMeasured');
    event.fish = fish;
    emit(event);
}

/**
 * When fish is evaluated this transaction should get executed
 * @param {hr.foi.fishynet.EvaluateFish} fish evaluation transaction
 * @transaction
 */
async function evaluateFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;

    fish.regulator = getFactory().newRelationship(`${NS}.Regulator`, tx.regulator.getIdentifier());
    fish.state = 'EVALUATED';
    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.update(fish);
}

/**
 * When fish is traded this transaction should get executed
 * @param {hr.foi.fishynet.TradeFish} fish trade transaction
 * @transaction
 */
async function tradeFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;

    let lastWeightMeasurement = null;
    try {
        lastWeightMeasurement = fish.history.filter(t => t.MeasurementType === 'WEIGHT').sort(t => t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing weight measure');
    }

    let lastFatMeasurement = null;
    try {
        lastFatMeasurement = fish.history.filter(t => t.MeasurementType === 'FAT').sort(t => t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing fat measure');
    }

    if (!lastWeightMeasurement || !lastFatMeasurement) {
        throw new Error('Missing weight or fat measurement');
    }

    let totalPrice = lastWeightMeasurement.value * lastFatMeasurement.value;

    if (tx.buyer.balance < totalPrice) {
        throw new Error('Insufficient buyer funds');
    }

    fish.fisher.balance += totalPrice;
    tx.buyer -= totalPrice;

    tx.totalPrice = totalPrice;

    fish.history.add(tx);

    const fisherRegistry = await getParticipantRegistry(`${NS}.Fisher`);
    const buyerRegistry = await getParticipantRegistry(`${NS}.Buyer`);
    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await fisherRegistry.update(fish.fisher);

    await buyerRegistry.update(tx.buyer);

    await assetRegistry.update(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent(NS, 'FishSoldEvent');
    event.fish = fish;
    emit(event);
}
