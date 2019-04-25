'use strict';
/**
 * Write the unit tests for your transaction processor functions here
 */

const { AdminConnection } = require('composer-admin');
const { BusinessNetworkConnection } = require('composer-client');
const {
    NetworkCardStoreManager,
    BusinessNetworkDefinition,
    CertificateUtil,
    IdCard,
} = require('composer-common');

const path = require('path');
const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

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

describe(`#${namespace}`, () => {
    // In-memory card store for testing
    const cardStore = NetworkCardStoreManager.getCardStore({
        type: 'composer-wallet-inmemory'
    });

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let bnc;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice, Eve, Bob and John.
    const wildFisherName = 'alice';
    const farmFisherName = 'eve';
    const buyerName = 'bob';
    const regulatorName = 'john';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let bnd = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = bnd.getName();
        await adminConnection.install(bnd);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(
            businessNetworkName,
            bnd.getVersion(),
            startOptions
        );
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

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
        wildFisher.balance = 10.00;

        const farmFisher = factory.newResource(namespace, fisherType, 'eve@email.com');
        farmFisher.name = 'Eve';
        farmFisher.balance = 50.00;

        fisherRegistry.addAll([wildFisher, farmFisher]);

        const buyerRegistry = await bnc.getParticipantRegistry(buyerCanonicalName);
        // create the buyer
        const buyer = factory.newResource(namespace, buyerType, 'bob@email.com');
        buyer.name = 'Bob';
        buyer.balance = 100.00;

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
        await importCardForIdentity(wildFisherName, identity);
        identity = await bnc.issueIdentity(`${fisherCanonicalName}#eve@email.com`, 'eve');
        await importCardForIdentity(farmFisherName, identity);
        identity = await bnc.issueIdentity(`${buyerCanonicalName}#bob@email.com`, 'bob');
        await importCardForIdentity(buyerName, identity);
        identity = await bnc.issueIdentity(`${regulatorCanonicalName}#john@email.com`, 'john');
        await importCardForIdentity(regulatorName, identity);
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

    it('Wild fisher cannot add assets that Buyer owns', async () => {
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

    it('Buyer can not directly add assets that he owns', async () => {
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

    it('Fisher can not update their assets without a transaction', async () => {
        // Use the identity for Alice.
        await useIdentity(farmFisherName);

        // Get the asset, then update the asset.
        const assetRegistry = await bnc.getAssetRegistry(fishCanonicalName);
        const existingAsset = await assetRegistry.get('FTUNA1');

        existingAsset.state = 'STORED';

        await assetRegistry.update(existingAsset)
            .should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Regulator can measure fat of any fish', async () => {
        // Use the identity for Alice.
        await useIdentity(regulatorName);

        // Create MeasureFish transaction
        const transaction = factory.newTransaction(namespace, 'MeasureFish');
        transaction.fish = factory.newRelationship(namespace, fishType, 'WTUNA1');
        transaction.source = factory.newRelationship(namespace, regulatorType, 'john@email.com');
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

    it('Fisher can not measure other fisher\'s fish', async () => {
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

        // Update the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.update(asset2);

        // Validate the asset.
        asset2 = await assetRegistry.get('2');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.value.should.equal('60');
    });

    it('Buyer cannot update Wild fisher\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Create the asset.
        const asset1 = factory.newResource(namespace, assetType, '1');
        asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset1.value = '60';

        // Update the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.update(asset1).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Wild fisher can remove her assets', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.remove('1');
        const exists = await assetRegistry.exists('1');
        exists.should.be.false;
    });

    it('Wild fisher cannot remove Buyer\'s assets', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('2').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Buyer can remove his assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.remove('2');
        const exists = await assetRegistry.exists('2');
        exists.should.be.false;
    });

    it('Buyer cannot remove Wild fisher\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('1').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Wild fisher can submit a transaction for her assets', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'SampleTransaction');
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.newValue = '50';
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset1 = await assetRegistry.get('1');

        // Validate the asset.
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.value.should.equal('50');

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#1');
        event.oldValue.should.equal('10');
        event.newValue.should.equal('50');
    });

    it('Wild fisher cannot submit a transaction for Buyer\'s assets', async () => {
        // Use the identity for Alice.
        await useIdentity(wildFisherName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'SampleTransaction');
        transaction.asset = factory.newRelationship(namespace, assetType, '2');
        transaction.newValue = '50';
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Buyer can submit a transaction for his assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'SampleTransaction');
        transaction.asset = factory.newRelationship(namespace, assetType, '2');
        transaction.newValue = '60';
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const asset2 = await assetRegistry.get('2');

        // Validate the asset.
        asset2.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#bob@email.com');
        asset2.value.should.equal('60');

        // Validate the events.
        events.should.have.lengthOf(1);
        const event = events[0];
        event.eventId.should.be.a('string');
        event.timestamp.should.be.an.instanceOf(Date);
        event.asset.getFullyQualifiedIdentifier().should.equal(assetNS + '#2');
        event.oldValue.should.equal('20');
        event.newValue.should.equal('60');
    });

    it('Buyer cannot submit a transaction for Wild fisher\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(buyerName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'SampleTransaction');
        transaction.asset = factory.newRelationship(namespace, assetType, '1');
        transaction.newValue = '60';
        businessNetworkConnection.submitTransaction(transaction).should.be.rejectedWith(/does not have .* access to resource/);
    });

});
