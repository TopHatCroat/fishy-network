'use strict';

const { AdminConnection } = require('composer-admin');

const {
    NetworkCardStoreManager,
    BusinessNetworkDefinition,
    CertificateUtil,
    IdCard,
} = require('composer-common');

// Embedded connection used for local testing
const connectionProfile = {
    name: 'embedded',
    'x-type': 'embedded'
};


/**
 * Creates admin connection to the network
 * @param cardStore identity card wallet
 * @returns adminConnection
 */
async function createAdminConnection(cardStore) {
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

    const adminConnection = new AdminConnection({ cardStore: cardStore });

    await adminConnection.importCard(deployerCardName, deployerCard);
    await adminConnection.connect(deployerCardName);

    return adminConnection;
}

/**
 * @param {String} businessNetworkName The name of the business network to create the card for
 * @param {Object} identity The identity details
 */
function createCardForIdentity(businessNetworkName, identity) {
    const metadata = {
        userName: identity.userID,
        version: 1,
        enrollmentSecret: identity.userSecret,
        businessNetwork: businessNetworkName
    };
    const card = new IdCard(metadata, connectionProfile);
    return card;
}

module.exports.createAdminConnection = createAdminConnection;
module.exports.createCardForIdentity = createCardForIdentity;
