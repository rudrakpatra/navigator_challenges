import { Character, Encryption, PrivateKey, Provable, PublicKey } from "o1js";
import {
  AgentData,
  Message,
  MessageValidityProgram,
  MsgNo,
  PrivateMessages,
  SecurityCode,
} from "../src/privateMessages";
import { TestingAppChain } from "@proto-kit/sdk";
import { log } from "@proto-kit/common";
import { Balances } from "@proto-kit/library";

log.setLevel("ERROR");

let appChain: any;
let spyMasterPrivateKey: PrivateKey;
let spyMaster: PublicKey;

describe("privateMessages", () => {
  beforeAll(async () => {
    appChain = TestingAppChain.fromRuntime({
      Balances,
      PrivateMessages,
    });
    spyMasterPrivateKey = PrivateKey.random();
    spyMaster = spyMasterPrivateKey.toPublicKey();
    appChain.configurePartial({
      Runtime: {
        Balances: {},
        PrivateMessages: {
          spyMaster,
        },
      },
    });
    await appChain.start();
    await MessageValidityProgram.compile();
  }, 1_000_000);

  it("should be able to add a valid message", async () => {
    const privateMessages: PrivateMessages =
      appChain.runtime.resolve("PrivateMessages");
    const agentOnekey = PrivateKey.random();
    const agentOne = agentOnekey.toPublicKey();
    const securityCode = SecurityCode.from("01");
    console.log(securityCode.hash().toString());
    // Spy Master adds an agent
    appChain.setSigner(spyMasterPrivateKey);
    let txn1 = await appChain.transaction(spyMaster, () => {
      privateMessages.addAgent(agentOne, securityCode.hash());
    });
    await txn1.sign();
    await txn1.send();

    const block1 = await appChain.produceBlock();
    if (block1?.transactions[0].statusMessage)
      console.log(block1?.transactions[0].statusMessage);
    const prevAgentData =
      (await appChain.query.runtime.PrivateMessages.store.get(
        agentOne
      )) as AgentData;
    expect(prevAgentData?.lastMsgNo.toBigInt().toString()).toStrictEqual("0");
    expect(prevAgentData?.securityCodeHash.toBigInt().toString()).toStrictEqual(
      securityCode.hash().toBigInt().toString()
    );

    const message = Message.from("ONIICHAN-MSG");

    const messageNo = MsgNo.from(2);
    const proof = await MessageValidityProgram.generate(
      spyMaster,
      message,
      securityCode
    );
    appChain.setSigner(agentOnekey);
    let txn2 = await appChain.transaction(agentOne, () => {
      privateMessages.addMessage(messageNo, proof);
    });
    await txn2.sign();
    await txn2.send();

    let block2 = await appChain.produceBlock();
    if (block2?.transactions[0].statusMessage)
      console.log(block2?.transactions[0].statusMessage);

    const agentDataAfter =
      (await appChain.query.runtime.PrivateMessages.store.get(
        agentOne
      )) as AgentData;
    expect(agentDataAfter?.lastMsgNo.toBigInt().toString()).toStrictEqual("2");
    expect(
      agentDataAfter.message
        .decrypt(spyMasterPrivateKey)
        .map((c) => c.toString())
        .join("")
    ).toStrictEqual("ONIICHAN-MSG");
  }, 1_000_000);

  it("should fail if security code is wrong", async () => {
    const privateMessages = appChain.runtime.resolve(
      "PrivateMessages"
    ) as PrivateMessages;
    const agentOneKey = PrivateKey.random();
    const agentOne = agentOneKey.toPublicKey();
    const securityCode = SecurityCode.from("01");

    // Spy Master adds an agent
    appChain.setSigner(spyMasterPrivateKey);
    let txn1 = await appChain.transaction(spyMaster, () => {
      privateMessages.addAgent(agentOne, securityCode.hash());
    });
    await txn1.sign();
    await txn1.send();

    const block1 = await appChain.produceBlock();
    if (block1?.transactions[0].statusMessage)
      console.log(block1?.transactions[0].statusMessage);

    appChain.setSigner(agentOneKey);
    const message = Message.from("ONIICHAN-MSG");

    const wrongSecurityCode = SecurityCode.from("XX");

    const proof = await MessageValidityProgram.generate(
      spyMaster,
      message,
      wrongSecurityCode
    );

    let txn = await appChain.transaction(agentOne, () => {
      privateMessages.addMessage(MsgNo.from(1), proof);
    });
    await txn.sign();
    await txn.send();
    let block2 = await appChain.produceBlock();
    expect(block2?.transactions[0].status.toBoolean()).toBe(false);
    expect(block2?.transactions[0].statusMessage).toBe(
      "Security Code Hash does not match"
    );
  }, 1_000_000);
});
