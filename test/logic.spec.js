'use strict';
/**
 * Write the unit tests for your transaction processor functions here
 */

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const { BusinessNetworkConnection } = require('composer-client');
const { NetworkCardStoreManager } = require('composer-common');

const {
    createAdminConnection,
    createCardForIdentity,
    createNetworkDefinitionAndImportAdmin,
} = require('./utils');

// Name of the business network card containing the administrative identity for
// the business network
const adminCardName = 'admin@fishy-network';
const namespace = 'hr.foi.fishynet';
const fishType = 'Fish';
const fishCanonicalName = `${namespace}.${fishType}`;
const fisherType = 'Fisher';
const fisherCanonicalName = `${namespace}.${fisherType}`;
const buyerType = 'Buyer';
const buyerCanonicalName = `${namespace}.${buyerType}`;
const regulatorType = 'Regulator';
const regulatorCanonicalName = `${namespace}.${regulatorType}`;

// These are the identities for Alice, Eve, Bob and John.
const wildFisherName = 'alice';
const farmFisherName = 'eve';
const buyerName = 'bob';
const regulatorName = 'john';

// In-memory card store for testing
const cardStore = NetworkCardStoreManager.getCardStore({
    type: 'composer-wallet-inmemory'
});

describe(`#${namespace} network reads and fish creation`, () => {
    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;
    // This is the business network connection the tests will use.
    let bnc;
    // This is the factory for creating instances of types.
    let factory;
    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        adminConnection = await createAdminConnection(cardStore);
    });

    // This is called before each test is executed.
    beforeEach(async () => {
        businessNetworkName = await createNetworkDefinitionAndImportAdmin(
            adminConnection,
            adminCardName
        );
        // Create and establish a business network connection
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', event => {
            events.push(event);
        });
        await bnc.connect(adminCardName);

        // Get the factory for the business network.
        factory = bnc.getBusinessNetwork().getFactory();

        const fisherRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        // Create the fishers.
        const wildFisher = factory.newResource(namespace, fisherType, 'alice@email.com');
        wildFisher.name = 'Alice';
        wildFisher.balance = 100.00;

        const farmFisher = factory.newResource(namespace, fisherType, 'eve@email.com');
        farmFisher.name = 'Eve';
        farmFisher.balance = 500.00;

        fisherRegistry.addAll([wildFisher, farmFisher]);

        const buyerRegistry = await bnc.getParticipantRegistry(buyerCanonicalName);
        // create the buyer
        const buyer = factory.newResource(namespace, buyerType, 'bob@email.com');
        buyer.name = 'Bob';
        buyer.balance = 1000.00;

        buyerRegistry.add(buyer);

        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        // Create the assets.
        const asset1 = factory.newResource(namespace, fishType, 'WTUNA1');
        asset1.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.owner = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.type = 'TUNA_WILD';
        asset1.state = 'STORED';

        const asset2 = factory.newResource(namespace, fishType, 'FTUNA1');
        asset2.fisher = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.owner = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.type = 'TUNA_FARM';
        asset2.state = 'ALIVE';

        assetRegistry.addAll([asset1, asset2]);

        // Issue the identities.
        let identity = await bnc.issueIdentity(`${fisherCanonicalName}#alice@email.com`, 'alice');
        await adminConnection.importCard(
            wildFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${fisherCanonicalName}#eve@email.com`, 'eve');
        await adminConnection.importCard(
            farmFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${buyerCanonicalName}#bob@email.com`, 'bob');
        await adminConnection.importCard(
            buyerName,
            createCardForIdentity(businessNetworkName, identity)
        );
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await bnc.disconnect();
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', (event) => {
            events.push(event);
        });
        await bnc.connect(cardName);
        factory = bnc.getBusinessNetwork().getFactory();
    }

    it('Wild fisher can read all of the assets', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#eve@email.com`);
        asset1.type.should.equal('TUNA_FARM');
        asset1.state.should.equal('ALIVE');

        const asset2 = assets[1];
        asset2.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        asset2.type.should.equal('TUNA_WILD');
        asset2.state.should.equal('STORED');
    });

    it('Farm fisher can read all of the assets', async () => {
        // Use the identity for Bob.
        await useIdentity(farmFisherName);
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#eve@email.com`);
        asset1.type.should.equal('TUNA_FARM');
        asset1.state.should.equal('ALIVE');

        const asset2 = assets[1];
        asset2.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        asset2.type.should.equal('TUNA_WILD');
        asset2.state.should.equal('STORED');
    });

    it('Buyer can read all of the assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#eve@email.com`);
        asset1.type.should.equal('TUNA_FARM');
        asset1.state.should.equal('ALIVE');

        const asset2 = assets[1];
        asset2.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        asset2.type.should.equal('TUNA_WILD');
        asset2.state.should.equal('STORED');
    });

    it('Wild fisher can catch new fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create CatchFish transaction
        const transaction = factory.newTransaction(namespace, 'CatchFish');
        transaction.fishId = 'WTUNA2';
        transaction.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.latitude = 45.50;
        transaction.longitude = 15.90;
        await bnc.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const createdAsset = await assetRegistry.get('WTUNA2');

        // Validate the asset.
        createdAsset.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        createdAsset.fisher.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        createdAsset.type.should.equal('TUNA_WILD');
        createdAsset.state.should.equal('STORED');

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA2`);
        event.fisher.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);

        // Validate the asset.
        const savedAsset = await assetRegistry.get('WTUNA2');
        savedAsset.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        savedAsset.type.should.equal('TUNA_WILD');
        savedAsset.state.should.equal('STORED');
    });

    it('Wild fisher can not add assets that Buyer owns', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create the asset.
        let asset = factory.newResource(namespace, fishType, 'WTUNA2');
        asset.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset.owner = factory.newRelationship(namespace, buyerType, 'bob@email.com');
        asset.type = 'TUNA_WILD';
        asset.state = 'STORED';

        // Try to add the asset, should fail.
        const assetRegistry = await  bnc.getAssetRegistry(fishCanonicalName);
        assetRegistry.add(asset).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Buyer cannot directly add assets that he owns', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Create the asset.
        let asset = factory.newResource(namespace, fishType, 'WTUNA3');
        asset.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset.owner = factory.newRelationship(namespace, buyerType, 'bob@email.com');
        asset.type = 'TUNA_WILD';
        asset.state = 'STORED';

        // Add the asset, then get the asset.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        assetRegistry.add(asset).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Fisher cannot update their assets without a transaction', async () => {
        // Use the identity for Alice.
        await useIdentity(farmFisherName);

        // Get the asset, then update the asset.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const existingAsset = await assetRegistry.get('FTUNA1');

        existingAsset.state = 'STORED';

        await assetRegistry.update(existingAsset)
            .should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Fisher cannot measure other fisher\'s fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'FTUNA1');
        transaction.source = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.type = 'WEIGHT';
        transaction.value = 240;
        await bnc.submitTransaction(transaction)
            .should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Buyer cannot buy not evaluated fish', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Create TradeFish transaction
        const transaction = factory.newTransaction(namespace, 'TradeFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'FTUNA1');
        transaction.buyer = factory.newRelationship(namespace, buyerType, 'bob@email.com');
        transaction.pricePerKilo = 2;
        transaction.fatMultiplier = 1.2;
        transaction.idealFatPercentage = 8.0;

        await bnc.submitTransaction(transaction)
            .should.be.rejectedWith(/Fish must be evaluated by a regulator before trade/);
    });

    it('Buyer cannot remove Wild fisher\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        assetRegistry.remove('WTUNA1')
            .should.be.rejectedWith(/does not have .* access to resource/);
    });
});

describe(`#${namespace} fish can be measured, evaluated and sold to a buyer`, () => {
    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;
    // This is the business network connection the tests will use.
    let bnc;
    // This is the factory for creating instances of types.
    let factory;
    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        adminConnection = await createAdminConnection(cardStore);

        businessNetworkName = await createNetworkDefinitionAndImportAdmin(
            adminConnection,
            adminCardName
        );
        // Create and establish a business network connection
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', event => {
            events.push(event);
        });
        await bnc.connect(adminCardName);

        // Get the factory for the business network.
        factory = bnc.getBusinessNetwork().getFactory();

        const fisherRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        // Create the fishers.
        const wildFisher = factory.newResource(namespace, fisherType, 'alice@email.com');
        wildFisher.name = 'Alice';
        wildFisher.balance = 100.00;

        const farmFisher = factory.newResource(namespace, fisherType, 'eve@email.com');
        farmFisher.name = 'Eve';
        farmFisher.balance = 500.00;

        fisherRegistry.addAll([wildFisher, farmFisher]);

        const buyerRegistry = await bnc.getParticipantRegistry(buyerCanonicalName);
        // create the buyer
        const buyer = factory.newResource(namespace, buyerType, 'bob@email.com');
        buyer.name = 'Bob';
        buyer.balance = 1000.00;

        buyerRegistry.add(buyer);

        const regulatorRegistry = await bnc.getParticipantRegistry(regulatorCanonicalName);
        // create the regulator
        const regulator = factory.newResource(namespace, regulatorType, 'john@email.com');
        regulator.name = 'John';

        regulatorRegistry.add(regulator);

        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        // Create the assets.
        const asset1 = factory.newResource(namespace, fishType, 'WTUNA1');
        asset1.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.owner = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.type = 'TUNA_WILD';
        asset1.state = 'STORED';

        const asset2 = factory.newResource(namespace, fishType, 'FTUNA1');
        asset2.fisher = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.owner = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.type = 'TUNA_FARM';
        asset2.state = 'ALIVE';

        assetRegistry.addAll([asset1, asset2]);

        // Issue the identities.
        let identity = await bnc.issueIdentity(`${fisherCanonicalName}#alice@email.com`, 'alice');
        await adminConnection.importCard(
            wildFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${fisherCanonicalName}#eve@email.com`, 'eve');
        await adminConnection.importCard(
            farmFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${buyerCanonicalName}#bob@email.com`, 'bob');
        await adminConnection.importCard(
            buyerName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${regulatorCanonicalName}#john@email.com`, 'john');
        await adminConnection.importCard(
            regulatorName,
            createCardForIdentity(businessNetworkName, identity)
        );
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await bnc.disconnect();
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', (event) => {
            events.push(event);
        });
        await bnc.connect(cardName);
        factory = bnc.getBusinessNetwork().getFactory();
    }

    it('Regulator cannot evaluate any living fish', async () => {
        // Use the identity for Alice.
        await useIdentity(regulatorName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'EvaluateFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'FTUNA1');
        transaction.regulator = factory.newRelationship(namespace, regulatorType, 'john@email.com');
        await bnc.submitTransaction(transaction)
            .should.be
            .rejectedWith(/Fish must be killed and stored by a regulator before evaluation/);
    });

    it('Regulator can measure fat of any fish', async () => {
        // Use the identity for Alice.
        await useIdentity(regulatorName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source =
            factory.newRelationship(namespace, regulatorType, 'john@email.com');
        transaction.type = 'FAT';
        transaction.value = 8.20;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${regulatorCanonicalName}#john@email.com`);
    });

    it('Fisher can measure weight of his fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.type = 'WEIGHT';
        transaction.value = 240;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
    });

    it('Regulator can evaluate any stored fish', async () => {
        // Use the identity for John.
        await useIdentity(regulatorName);

        // Create EvaluateFish transaction
        const transaction = factory.newTransaction(namespace, 'EvaluateFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.regulator =
            factory.newRelationship(namespace, regulatorType, 'john@email.com');
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${regulatorCanonicalName}#john@email.com`);
    });

    it('Buyer can buy measured and evaluated fish', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Create TradeFish transaction
        const transaction = factory.newTransaction(namespace, 'TradeFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.buyer = factory.newRelationship(namespace, buyerType, 'bob@email.com');
        transaction.pricePerKilo = 2;
        transaction.fatMultiplier = 1.2;
        transaction.idealFatPercentage = 8.0;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.buyer.getFullyQualifiedIdentifier()
            .should.equal(`${buyerCanonicalName}#bob@email.com`);
        event.seller.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
    });


    it('Seller has the correct balance after trade', async () => {
        // Use the identity for Eve.
        await useIdentity(wildFisherName);

        // Get the seller.
        const sellerRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        const seller = await sellerRegistry.get('alice@email.com');

        // Validate the balance.
        seller.balance.should.equal(215.20);
    });

    it('Buyer has the correct balance after trade', async () => {
        // Use the identity for Bob.
        await useIdentity(farmFisherName);

        // Get the buyer.
        const buyerRegistry = await bnc.getParticipantRegistry(buyerCanonicalName);
        const seller = await buyerRegistry.get('bob@email.com');

        // Validate the balance.
        seller.balance.should.equal(884.8);
    });
});


describe(`#${namespace} fish can be measured and sold to fisher`, () => {
    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;
    // This is the business network connection the tests will use.
    let bnc;
    // This is the factory for creating instances of types.
    let factory;
    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        adminConnection = await createAdminConnection(cardStore);

        businessNetworkName = await createNetworkDefinitionAndImportAdmin(
            adminConnection,
            adminCardName
        );
        // Create and establish a business network connection
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', event => {
            events.push(event);
        });
        await bnc.connect(adminCardName);

        // Get the factory for the business network.
        factory = bnc.getBusinessNetwork().getFactory();

        const fisherRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        // Create the fishers.
        const wildFisher = factory.newResource(namespace, fisherType, 'alice@email.com');
        wildFisher.name = 'Alice';
        wildFisher.balance = 100.00;

        const farmFisher = factory.newResource(namespace, fisherType, 'eve@email.com');
        farmFisher.name = 'Eve';
        farmFisher.balance = 500.00;

        fisherRegistry.addAll([wildFisher, farmFisher]);

        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        // Create the assets.
        const asset1 = factory.newResource(namespace, fishType, 'WTUNA1');
        asset1.fisher = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.owner = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        asset1.type = 'TUNA_WILD';
        asset1.state = 'STORED';

        const asset2 = factory.newResource(namespace, fishType, 'FTUNA1');
        asset2.fisher = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.owner = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        asset2.type = 'TUNA_FARM';
        asset2.state = 'ALIVE';

        assetRegistry.addAll([asset1, asset2]);

        // Issue the identities.
        let identity = await bnc.issueIdentity(`${fisherCanonicalName}#alice@email.com`, 'alice');
        await adminConnection.importCard(
            wildFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );

        identity = await bnc.issueIdentity(`${fisherCanonicalName}#eve@email.com`, 'eve');
        await adminConnection.importCard(
            farmFisherName,
            createCardForIdentity(businessNetworkName, identity)
        );
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await bnc.disconnect();
        bnc = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        bnc.on('event', (event) => {
            events.push(event);
        });
        await bnc.connect(cardName);
        factory = bnc.getBusinessNetwork().getFactory();
    }

    it('Farm fisher can not buy a not measured fish of a wild fisher', async () => {
        // Use the identity for Eve.
        await useIdentity(farmFisherName);

        // Submit a trade transaction.
        const transaction = factory.newTransaction(namespace, 'TradeFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.buyer = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        transaction.pricePerKilo = 1;
        transaction.fatMultiplier = 1;
        transaction.idealFatPercentage = 4.0;
        await bnc.submitTransaction(transaction)
            .should.be.rejectedWith('Missing weight or fat measurement');
    });

    it('Fisher can measure weight of his fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.type = 'WEIGHT';
        transaction.value = 80;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
    });

    it('Fisher can measure fat of his fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.type = 'FAT';
        transaction.value = 3.8;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
    });

    it('Fisher can measure temperature of his fish', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source = factory.newRelationship(namespace, fisherType, 'alice@email.com');
        transaction.type = 'TEMPERATURE';
        transaction.value = -4;
        await bnc.submitTransaction(transaction);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier().should.equal(`${fishCanonicalName}#WTUNA1`);
        event.source.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
    });

    it('Farm fisher can buy a measured fish of a wild fisher', async () => {
        // Use the identity for Eve.
        await useIdentity(farmFisherName);

        // Submit a trade transaction.
        const transaction = factory.newTransaction(namespace, 'TradeFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.buyer = factory.newRelationship(namespace, fisherType, 'eve@email.com');
        transaction.pricePerKilo = 1;
        transaction.fatMultiplier = 1;
        transaction.idealFatPercentage = 4.0;
        await bnc.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const asset1 = await assetRegistry.get('WTUNA1');

        // Validate the asset.
        asset1.owner.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#eve@email.com`);

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.fish.getFullyQualifiedIdentifier()
            .should.equal(`${fishCanonicalName}#WTUNA1`);
        event.seller.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#alice@email.com`);
        event.buyer.getFullyQualifiedIdentifier()
            .should.equal(`${fisherCanonicalName}#eve@email.com`);
    });

    it('Seller has the correct balance after trade', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Get the seller.
        const sellerRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        const seller = await sellerRegistry.get('alice@email.com');

        // Validate the balance.
        seller.balance.should.equal(116.00);
    });

    it('Buyer has the correct balance after trade', async () => {
        // Use the identity for Eve.
        await useIdentity(farmFisherName);

        // Get the buyer.
        const fisherRegistry = await bnc.getParticipantRegistry(fisherCanonicalName);
        const seller = await fisherRegistry.get('eve@email.com');

        // Validate the balance.
        seller.balance.should.equal(484.00);
    });

});
