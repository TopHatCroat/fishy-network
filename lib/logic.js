/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write your transction processor functions here
 */

/**
 * When fish is caught this transaction shoud get executed
 * @param {hr.foi.fishynet.FishCaught} fish caught transaction
 * @transaction
 */
async function fishCaughtTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const factory = getFactory();

    const fish = factory.newResource(namespace, 'Fish', tx.fishId);
    fish.type = 'TUNA_WILD';
    fish.state = 'STORED';
    fish.fisher = factory.newRelationship(namespace, 'Fisher', tx.fisher.getIdentifier());
    fish.source = tx;

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.add(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent('hr.foi.fishynet', 'FishCaught');
    event.fish = fish;
    emit(event);
}

/**
 * When fish is born this transaction should get executed
 * @param {hr.foi.fishynet.FishCaught} fish born transaction
 * @transaction
 */
async function fishBornTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const factory = getFactory();

    const fish = factory.newResource(namespace, 'Fish', tx.fishId);
    fish.type = 'TUNA_FARM';
    fish.state = 'ALIVE';
    fish.fisher = factory.newRelationship(namespace, 'Fisher', tx.fisher.getIdentifier());
    fish.source = tx;

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.add(fish);
}

/**
 * When fish is born this transaction should get executed
 * @param {hr.foi.fishynet.FishBorn} fish born transaction
 * @transaction
 */
async function fishBornTransaction(tx) {
    const NS = 'hr.foi.fishynet';
    const factory = getFactory();

    const fish = factory.newResource(namespace, 'Fish', tx.fishId);
    fish.type = 'TUNA_FARM';
    fish.state = 'ALIVE';
    fish.fisher = factory.newRelationship(namespace, 'Fisher', tx.fisher.getIdentifier());
    fish.source = tx;

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.add(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent('hr.foi.fishynet', 'FishCaughtEvent');
    event.fish = fish;
    emit(event);
}

/**
 * When fish is killed this transaction should get executed
 * @param {hr.foi.fishynet.FishCaught} fish killed transaction
 * @transaction
 */
async function fishKilledTransaction(tx) {
    const fish = tx.fish;
    fish.state = 'STORED';
    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.update(fish);
}

/**
 * When fish is meassured for fat or weight this transaction should get executed
 * @param {hr.foi.fishynet.FishCaught} fish meassure transaction
 * @transaction
 */
async function fishMeassureTransaction(tx) {
    const fish = tx.fish;

    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.update(fish);
}

/**
 * When fish is evaluated this transaction should get executed
 * @param {hr.foi.fishynet.FishCaught} fish evaluation transaction
 * @transaction
 */
async function fishEvaluateTransaction(tx) {
    const fish = tx.fish;

    fish.regulator = factory.newRelationship(namespace, 'Regulator', tx.regulator.getIdentifier());
    fish.state = 'EVALUATED'
    fish.history.add(tx);

    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await assetRegistry.update(fish);
}

/**
 * When fish is evaluated this transaction should get executed
 * @param {hr.foi.fishynet.FishCaught} fish evaluation transaction
 * @transaction
 */
async function fishSellTransaction(tx) {
    const fish = tx.fish;

    let lastWeightMeasurement = null;
    try {
        lastWeightMeasurement = fish.history.filter(t => t.MeasurementType == 'WEIGHT').sort(t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing weight meassure');
    }

    let lastFatMeasurement = null;
    try {
        lastFatMeasurement = fish.history.filter(t => t.MeasurementType == 'FAT').sort(t.timestamp)[0];
    } catch(e) {
        throw new Error('Missing fat meassure');
    }

    if(!lastWeightMeasurement || !lastFatMeasurement)
        throw new Error('Missing weight or fat meassurement');

    let totalPrice = lastWeightMeasurement.value * lastFatMeasurement.value;

    if(tx.buyer.balance < totalPrice)
        throw new Error('Insufficient buyer funds');

    fish.fisher.balance += totalPrice;
    tx.buyer -= totalPrice;

    tx.totalPrice = totalPrice;

    fish.state = 'SOLD'
    fish.history.add(tx);

    const fisherRegistry = await getParticipantRegistry('hr.foi.fishynet.Fisher');
    const buyerRegistry = await getParticipantRegistry('hr.foi.fishynet.Buyer');
    const assetRegistry = await getAssetRegistry('hr.foi.fishynet.Fish');

    await fisherRegistry.update(fish.fisher);
    
    await buyerRegistry.update(tx.buyer);

    await assetRegistry.update(fish);

    // Emit an event for the modified asset.
    let event = getFactory().newEvent('hr.foi.fishynet', 'FishSoldEvent');
    event.fish = fish;
    emit(event);
}