# fishy-network

A network for trading raw fish and other tasty underwater animals

## Usage

#### Prerequisites

* Node 8.16.0

Install required packages by running:
`npm i -g composer-cli@0.20 composer-rest-server@0.20 composer-playground@0.20`

Optionally install VS Code extension `Hyperledger Composer`

#### Crete a network

Inside the `fabric-scripts` directory, execute the following steps

* Download Fabric images: `./downloadFabric.sh`
* Run the start script: `./startFabric.sh`. This will
  * Start the downloaded Fabric images
  * Create a channel named `composerchannel`
  * Join the peer to that channel

You can stop or destroy the containers by running `./stopFabric.sh` or
`./teardownFabric.sh`

#### Initiate the Composer environment

Create and import the Administrator credentials (Business Network Card)

* Inside the `fabric-scripts` directory run `./createPeerAdminCard.sh`
  * You can list existing BNCs with `composer card list`

  > In case of any conflict errors, delete the data from the previous run
`rm -rf ~/.composer`

* Generate the business network archive (`.bna` or banana file) by running the
following inside the **root application directory**
`composer archive create -t dir -n .`

* Install the generated archive (`fishy-network@0.0.1.bna`) with the Admin
credentials:
`composer network install --card PeerAdmin@hlfv1 --archiveFile fishy-network@0.0.1.bna`

* Start the installed network
`composer network start --networkName fishy-network --networkVersion 0.0.1 --card PeerAdmin@hlfv1 --networkAdmin admin --networkAdminEnrollSecret adminpw`
  > This will generate the Business Network card which can be imported into the
playground. You can run the playground client locally with `composer-playground`

* Start the REST server `composer-rest-server`