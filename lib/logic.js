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
 * When fish is meassured for fat, weight or temperature this transaction should get executed
 * @param {hr.foi.fishynet.MeasureFish} fish measure transaction
 * @transaction
 */
async function measureFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;
    const sourceBusiness = tx.source;

    // Emit an event for transaction.
    let event = getFactory().newEvent(NS, 'FishMeasured');
    event.fish = fish;
    event.source = sourceBusiness;

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
    const regulator = tx.regulator;

    if (fish.state !== 'STORED') {
        throw new Error('Fish must be killed and stored by a regulator before evaluation');
    }

    fish.regulator = getFactory().newRelationship(NS, 'Regulator', regulator.getIdentifier());
    fish.state = 'EVALUATED';

    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await assetRegistry.update(fish);

    // Emit an event for transaction.
    let event = getFactory().newEvent(NS, 'FishMeasured');
    event.fish = fish;
    event.source = regulator;

    emit(event);
}

/**
 * When fish is traded this transaction should get executed
 * @param {hr.foi.fishynet.TradeFish} fish trade transaction
 * @transaction
 */
async function tradeFishTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const fish = tx.fish;
    const seller = tx.fish.owner;
    const buyer = tx.buyer;
    const pricePerKilo = tx.pricePerKilo;
    const fatMultiplier = tx.fatMultiplier;
    const idealFatPercentage = tx.idealFatPercentage;

    const buyerCanonicalName = buyer.getFullyQualifiedType();

    let buyerRegistry;

    switch(buyerCanonicalName) {
        case `${NS}.Fisher`:
            buyerRegistry = await getParticipantRegistry(`${NS}.Fisher`);
            break;
        case `${NS}.Buyer`:
            if (fish.state !== 'EVALUATED') {
                throw new Error('Fish must be evaluated by a regulator before traded');
            }

            buyerRegistry = await getParticipantRegistry(`${NS}.Buyer`);
            break;
        default:
            throw new Error('Unsupported buyer type');
    }

    const weightMeasurements = await query('selectFishMeasurements', {
        fish: `resource:hr.foi.fishynet.Fish#${fish.fishId}`,
        measureType: 'WEIGHT'
    });

    let lastWeightMeasurement = null;
    try {
        lastWeightMeasurement = weightMeasurements.sort(t => t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing weight measure');
    }

    const fatMeasurements = await query('selectFishMeasurements', {
        fish: `resource:hr.foi.fishynet.Fish#${fish.fishId}`,
        measureType: 'FAT'
    });

    let lastFatMeasurement = null;
    try {
        lastFatMeasurement = fatMeasurements.sort(t => t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing fat measure');
    }

    if (!lastWeightMeasurement || !lastFatMeasurement) {
        throw new Error('Missing weight or fat measurement');
    }

    // Calculate the price according to data in transaction and distance to ideal fat percentage.
    const totalPrice = (lastWeightMeasurement.value * pricePerKilo) *
        (Math.abs(idealFatPercentage - lastFatMeasurement.value) * fatMultiplier);
    // Round the final price to 2 decimal places.
    const totalPriceRounded = Math.round(totalPrice * 100) / 100;

    console.log(totalPriceRounded);
    if (buyer.balance < totalPriceRounded) {
        throw new Error('Insufficient buyer funds');
    }

    // Update the balance for buyer and seller.
    seller.balance += totalPriceRounded;
    buyer.balance -= totalPriceRounded;
    fish.owner = buyer;

    const fisherRegistry = await getParticipantRegistry(`${NS}.Fisher`);
    const assetRegistry = await getAssetRegistry(`${NS}.Fish`);

    await buyerRegistry.update(buyer);
    await fisherRegistry.update(seller);
    await assetRegistry.update(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent(NS, 'FishSold');
    event.fish = fish;
    event.seller = seller;
    event.buyer = buyer;
    emit(event);
}
