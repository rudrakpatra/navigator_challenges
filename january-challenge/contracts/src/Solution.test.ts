import { Solution } from './Solution';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  MerkleMap,
} from 'o1js';

/*
 * This file specifies how to test the `Add` example smart contract. It is safe to delete this file and replace
 * with your own tests.
 *
 * See https://docs.minaprotocol.com/zkapps for more info.
 */

let proofsEnabled = false;

interface TestAccount {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}

describe('Solution', () => {
  let admin: TestAccount,
    testAccounts: TestAccount[],
    zkApp: {
      publicKey: PublicKey;
      privateKey: PrivateKey;
      contract: Solution;
    };
  beforeAll(async () => {
    if (proofsEnabled) await Solution.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    admin = Local.testAccounts[0];
    testAccounts = Local.testAccounts;
    const privateKey = PrivateKey.random();
    const publicKey = privateKey.toPublicKey();
    const contract = new Solution(publicKey);
    zkApp = {
      publicKey,
      privateKey,
      contract,
    };
  });

  async function localDeploy() {
    const txn = await Mina.transaction(admin.publicKey, () => {
      AccountUpdate.fundNewAccount(admin.publicKey);
      zkApp.contract.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([admin.privateKey, zkApp.privateKey]).send();
  }

  it('generates and deploys the smart contract', async () => {
    await localDeploy();
    const adminAddress = zkApp.contract.adminAddress.get();
    expect(adminAddress).toEqual(admin.publicKey);
  });

  /**
   * @param merkleMap
   * @param newAddress
   * @returns
   */
  async function addAddress(
    merkleMap: MerkleMap,
    admin: TestAccount,
    newAddress: PublicKey
  ) {
    const merklekey = Poseidon.hash(newAddress.toFields());
    merkleMap.set(merklekey, Field(1));
    const witness = merkleMap.getWitness(merklekey);

    const txn = await Mina.transaction(admin.publicKey, () => {
      zkApp.contract.storeEligibleAddress(newAddress, witness);
    });
    await txn.prove();
    await txn.sign([admin.privateKey]).send();
    return merkleMap;
  }

  async function addMessage(
    merkleMap: MerkleMap,
    eligibleAccount: TestAccount,
    message: Field
  ) {
    const merklekey = Poseidon.hash(eligibleAccount.publicKey.toFields());
    merkleMap.set(merklekey, Field(1));
    const witness = merkleMap.getWitness(merklekey);

    const txn = await Mina.transaction(eligibleAccount.publicKey, () => {
      zkApp.contract.checkAndStoreMessage(message, witness, witness);
    });
    await txn.prove();
    await txn.sign([eligibleAccount.privateKey]).send();
    return merkleMap;
  }

  // it('admin adds an address', async () => {
  //   await localDeploy();
  //   let merkleMap = new MerkleMap();
  //   merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
  //   //address count should update
  //   expect(zkApp.contract.addressesCount.get()).toEqual(Field(1));
  //   //and the merkle root is updated
  //   expect(zkApp.contract.addressesMerkleRoot.get())
  //     // to our merkle map's root
  //     .toEqual(merkleMap.getRoot());
  // });

  // it('admin adds an address and the address adds a message', async () => {
  //   await localDeploy();
  //   let merkleMap = new MerkleMap();
  //   merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
  //   const message = Field(parseInt('1001010', 2));
  //   merkleMap = await addMessage(merkleMap, testAccounts[2], message);

  //   //message count should update
  //   expect(zkApp.contract.messageCount.get()).toEqual(Field(1));
  //   //and the merkle root is updated
  //   expect(zkApp.contract.addressesMerkleRoot.get())
  //     // to our merkle map's root
  //     .toEqual(merkleMap.getRoot());
  // });

  // it('admin adds an address and the address tries to add message 2 times', async () => {
  //   await localDeploy();
  //   let merkleMap = new MerkleMap();
  //   merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
  //   const message = Field(parseInt('1101001010', 2));
  //   merkleMap = await addMessage(merkleMap, testAccounts[2], message);

  //   await expect(async () => {
  //     const message2 = Field(parseInt('1001001001', 2));
  //     merkleMap = await addMessage(merkleMap, testAccounts[2], message2);
  //   }).rejects.toThrowError('message is already present');
  // });

  // it('a not eligible address tries to add a message', async () => {
  //   await localDeploy();
  //   let merkleMap = new MerkleMap();
  //   await expect(async () => {
  //     const message = Field(parseInt('1001010', 2));
  //     merkleMap = await addMessage(merkleMap, testAccounts[2], message);
  //   }).rejects.toThrowError('merkle root does not match');
  // });

  // it('a not eligible address tries to add a message', async () => {
  //   await localDeploy();
  //   let merkleMap = new MerkleMap();
  //   await expect(async () => {
  //     const message = Field(parseInt('1001010', 2));
  //     merkleMap = await addMessage(merkleMap, testAccounts[2], message);
  //   }).rejects.toThrowError('merkle root does not match');
  // });

  it('admin adds an address and the address adds a incorrect message', async () => {
    await localDeploy();
    let merkleMap = new MerkleMap();
    merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
    await expect(async () => {
      const message = Field(parseInt('1101000', 2));
      merkleMap = await addMessage(merkleMap, testAccounts[2], message);
    }).rejects.toThrowError('flag1 is true implies others are false');
  });

  it('admin adds an address and the address adds a incorrect message', async () => {
    await localDeploy();
    let merkleMap = new MerkleMap();
    merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
    await expect(async () => {
      const message = Field(parseInt('1010100', 2));
      merkleMap = await addMessage(merkleMap, testAccounts[2], message);
    }).rejects.toThrowError('flag2 is true implies flag3 must also be true');
  });

  it('admin adds an address and the address adds a incorrect message', async () => {
    await localDeploy();
    let merkleMap = new MerkleMap();
    merkleMap = await addAddress(merkleMap, admin, testAccounts[2].publicKey);
    await expect(async () => {
      const message = Field(parseInt('1000110', 2));
      merkleMap = await addMessage(merkleMap, testAccounts[2], message);
    }).rejects.toThrowError(
      'flag4 is true implies flag5 and flag6 must also be true'
    );
  });
});
