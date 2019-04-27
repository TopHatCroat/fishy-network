'use strict';

const path = require('path');
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

/**
 * @param adminConnection connection to the network with right to install a network definition
 * @param adminCardName name of admin card with the credentials
 */
async function createNetworkDefinitionAndImportAdmin(adminConnection, adminCardName) {
    // Generate a business network definition from the project directory.
    let bnd = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
    const businessNetworkName = bnd.getName();
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

    return businessNetworkName;
}

module.exports.createAdminConnection = createAdminConnection;
module.exports.createCardForIdentity = createCardForIdentity;
module.exports.createNetworkDefinitionAndImportAdmin = createNetworkDefinitionAndImportAdmin;
