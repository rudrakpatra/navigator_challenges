import { runtimeModule, state, runtimeMethod, RuntimeModule } from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { UInt224 } from "@proto-kit/library";
import { Bool ,Character,Provable, PublicKey, Struct } from "o1js";

export class AgentID extends UInt224 {}
export class MsgNo extends UInt224 {}
export class SecurityCode extends Struct({
    code: Provable.Array(Character, 2)
}){
    public static from(s: string) {
        return new SecurityCode({code:Provable.Array(Character, 2).fromFields(s.split('').map(c=>Character.fromString(c).toField()))});
    }
    truncate() {
        return new SecurityCode({code:Provable.Array(Character, 2).fromFields(this.code.map(c=>c.toField()))});
    }
    assertLength() {
        for(let i=0;i<2;i++)
            assert(this.code[i].isNull().not(), "Security Code Length is not 2");
    }
    equals(x: SecurityCode): Bool {
        return (this.code[0].equals(x.code[0])).and(this.code[1].equals(x.code[1]));
    }
}
export class Message extends Struct({
    message: Provable.Array(Character, 12),
}){
    public static  DEFAULT = Message.from("000000000000");
    public static from(s: string) {
        return new Message({message:Provable.Array(Character, 12).fromFields(s.split('').map(c=>Character.fromString(c).toField()))});
    }
    truncate() {
        return new Message({message:Provable.Array(Character, 12).fromFields(this.message.map(c=>c.toField()))});
    }
    assertLength() {
        for(let i=0;i<12;i++)
            assert(this.message[i].isNull().not(), "Message Length is not 12");
    }
}

export class MessageDetails extends Struct({
    agentID: AgentID,
    message: Message,
    securityCode: SecurityCode
}){
    public static from(agentID: AgentID, message: Message, securityCode: SecurityCode) {
        return new MessageDetails({agentID,message,securityCode});
    }
}

export class AgentData extends Struct({
  lastMsgNo: MsgNo,
  message: Message,
  securityCode: SecurityCode
}){
    static from(lastMsgNo: MsgNo, message: Message, securityCode: SecurityCode) {
        return new AgentData({lastMsgNo, message, securityCode});
    }
}

interface MessagesConfig {
    owner: PublicKey;
}
  

@runtimeModule()
export class Messages extends RuntimeModule<MessagesConfig> {
  @state() public store= StateMap.from<AgentID,AgentData>(AgentID,AgentData);

  @runtimeMethod()
  public addAgent(
    agentID: AgentID,
    securityCode: SecurityCode
  ): void {
    assert(this.transaction.sender.value.equals(this.config.owner), "Sender is not the owner");
    securityCode.assertLength();
    const msgDetails = AgentData.from(MsgNo.from(0),Message.DEFAULT, securityCode);
    this.store.set(agentID,msgDetails);
  }

  @runtimeMethod()
  public addMessage(
    msgNo: MsgNo,
    {agentID,message,securityCode}: MessageDetails
  ): void {
    message.assertLength();
    securityCode.assertLength();
    const {isSome,value:agentData} = this.store.get(agentID);
    assert(isSome, "Agent does not exist");
    assert(msgNo.greaterThan(agentData.lastMsgNo), "Message number is not greater than last message number");
    assert(securityCode.equals(agentData.securityCode), "Security Code does not match");
    this.store.set(agentID,new AgentData({lastMsgNo:msgNo,message:message.truncate(),securityCode:securityCode.truncate()}));
  }
}
