import { Character, PrivateKey, Provable, PublicKey, Struct,} from "o1js";
import { AgentID, Message, MessageDetails, Messages, MsgNo, SecurityCode } from "../src/messages";
import { TestingAppChain } from "@proto-kit/sdk";
import { log } from "@proto-kit/common";
import { Balances } from "@proto-kit/library";

log.setLevel("ERROR");

let appChain:any;
let spyMasterPrivateKey: PrivateKey;
let spyMaster: PublicKey;

describe("messages", () => {

    beforeAll(async () => {
        appChain = TestingAppChain.fromRuntime({
            Balances,
            Messages,
        });
        spyMasterPrivateKey = PrivateKey.random();
        spyMaster = spyMasterPrivateKey.toPublicKey();
        appChain.configurePartial({
            Runtime: {
                Balances: {},
                Messages: {
                    owner: spyMaster,
                },
            },
        });
        await appChain.start();
        appChain.setSigner(spyMasterPrivateKey);
    }, 1_000_000);

    it("should demonstrate how messages work", async () => {
        const messages = appChain.runtime.resolve("Messages");

        const agentID=AgentID.from(0);
        const securityCode=SecurityCode.from("xy");

        const tx1 = await appChain.transaction(spyMaster, () => {
            messages.addAgent(agentID,securityCode);
        });
        
        await tx1.sign();
        await tx1.send();
        const block1 = await appChain.produceBlock();

        if(block1?.transactions[0].statusMessage) 
            console.log(block1?.transactions[0].statusMessage);

        expect(block1?.transactions[0].status.toBoolean()).toBe(true);

        const message=Message.from("0123456789AB");
        const messageNo=MsgNo.from(1);
        const messageDetails=MessageDetails.from(agentID,message,securityCode);

        const tx2=await appChain.transaction(spyMaster, () => {
            messages.addMessage(messageNo,messageDetails);
        });

        await tx2.sign();
        await tx2.send();

        const block2 = await appChain.produceBlock();

        if(block2?.transactions[0].statusMessage) 
            console.log(block2?.transactions[0].statusMessage);

        expect(block2?.transactions[0].status.toBoolean()).toBe(true);

        const agentData = await appChain.query.runtime.Messages.store.get(AgentID.from(0));
        expect(agentData).toBeDefined();
        expect(agentData?.message).toStrictEqual(message);

    }, 1_000_000);

    it("lengths of security code is checked", async () => {
        const messages = appChain.runtime.resolve("Messages");
        
        const agentID=AgentID.from(0);
        const securityCode=new SecurityCode({code:Provable.Array(Character, 3).fromFields("xyz".split('').map(c=>Character.fromString(c).toField()))});

        const tx1 = await appChain.transaction(spyMaster, () => {
            messages.addAgent(agentID,securityCode);
        });
        
        await tx1.sign();
        await tx1.send();
        const block1 = await appChain.produceBlock();

        expect(block1?.transactions[0].statusMessage).toStrictEqual(undefined);
        expect(block1?.transactions[0].status.toBoolean()).toBe(true);
        const agentData = await appChain.query.runtime.Messages.store.get(AgentID.from(0));
        expect(agentData).toBeDefined();
        expect(agentData?.securityCode.code).toStrictEqual(SecurityCode.from("xy").code);
        
    }, 1_000_000);
});
