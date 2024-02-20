import { Solution } from './';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  Reducer,
} from 'o1js';
import { Message } from './Solution';

let proofsEnabled = false;

interface TestAccount {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}

describe('Solution', () => {
  let testAccount: TestAccount,
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
    testAccount = Local.testAccounts[0];

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
    const txn = await Mina.transaction(testAccount.publicKey, () => {
      AccountUpdate.fundNewAccount(testAccount.publicKey);
      zkApp.contract.deploy();
      zkApp.contract.actionState.set(Reducer.initialActionState);
    });
    await txn.prove();
    await txn.sign([testAccount.privateKey, zkApp.privateKey]).send();
  }

  it('post message', async () => {
    await localDeploy();

    const txn = await Mina.transaction(testAccount.publicKey, () => {
      zkApp.contract.postMessage(
        Message.from(
          UInt64.from(50),
          UInt64.from(100),
          UInt64.from(2000),
          UInt64.from(8000),
          UInt64.from(10100)
        )
      );
    });
    await txn.prove();
    await txn.sign([testAccount.privateKey]).send();
  });
  it('valid message', async () => {
    expect(
      Message.from(
      UInt64.from(50),
      UInt64.from(100),
      UInt64.from(2000),
      UInt64.from(8000),
      UInt64.from(10100)
    ).isValid().toBoolean()
    ).toBe(true);
  });
  it('checksum validity check', async () => {
    expect(
      Message.from(
          UInt64.from(10),
          UInt64.from(1),
          UInt64.from(1000),
          UInt64.from(5000),
          UInt64.from(0)
      ).isValid().toBoolean()
    ).toBe(false);
  });

  it('should post wrong Message details', async () => {
    await localDeploy();
    Mina.transaction(testAccount.publicKey, () => {
        zkApp.contract.postMessage(
          Message.from(
            UInt64.from(10),
            UInt64.from(1),
            UInt64.from(1000),
            UInt64.from(5000),
            UInt64.from(0)
          )
        )
      })
  });

  it('agent 0 message should be valid', async () => {
    expect(
      Message.from(
      UInt64.from(50),
      UInt64.from(0),
      UInt64.from(2000),
      UInt64.from(8000),
      UInt64.from(0)
    ).isValid().toBoolean()).toBe(true);
  });

  it('should be able to process message', async () => {
    await localDeploy();
    // post 10 messages
    for (let i = 0; i < 10; i++) {
      const txn = await Mina.transaction(testAccount.publicKey, () => {
        zkApp.contract.postMessage(
          Message.from(
          UInt64.from(i*10),
          UInt64.from(i),
          UInt64.from(2000),
          UInt64.from(8000),
          UInt64.from(10000 + i))
        );
      });
      await txn.prove();
      await txn.sign([testAccount.privateKey]).send();
    }

    // post 10 messages wrong messages
    for (let i = 10; i < 20; i++) {
        const txn = await Mina.transaction(testAccount.publicKey, () => {
          zkApp.contract.postMessage(
            Message.from(
            UInt64.from(i*10),
            UInt64.from(i),
            UInt64.from(2000),
            UInt64.from(8000),
            UInt64.from(10000 + i + 1))
          );
        });
        await txn.prove();
        await txn.sign([testAccount.privateKey]).send();
      }

    const txn = await Mina.transaction(testAccount.publicKey, () => {
      zkApp.contract.processMessage();
    });
    await txn.prove();
    await txn.sign([testAccount.privateKey]).send();

    expect(zkApp.contract.highestMessageNumber.get().toBigInt()).toBe(90n);
  });
});
