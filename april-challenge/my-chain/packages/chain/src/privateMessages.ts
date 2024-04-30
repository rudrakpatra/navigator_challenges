import {
  runtimeModule,
  state,
  runtimeMethod,
  RuntimeModule,
} from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { UInt224 } from "@proto-kit/library";
import {
  Character,
  Field,
  Experimental,
  PublicKey,
  Struct,
  Group,
  Encryption,
  PrivateKey,
  Provable,
  Bool,
  Poseidon,
} from "o1js";

export class MsgNo extends UInt224 {}
export class SecurityCode extends Struct({
  code: Provable.Array(Character, 2),
}) {
  public static from(s: string) {
    return new SecurityCode({
      code: Provable.Array(Character, 2).fromFields(
        s.split("").map((c) => Character.fromString(c).toField())
      ),
    });
  }
  truncate() {
    return new SecurityCode({
      code: Provable.Array(Character, 2).fromFields(
        this.code.map((c) => c.toField())
      ),
    });
  }
  assertLength() {
    for (let i = 0; i < 2; i++)
      this.code[i].isNull().assertFalse("Security Code Length is not 2");
  }
  equals(x: SecurityCode): Bool {
    return this.code[0].equals(x.code[0]).and(this.code[1].equals(x.code[1]));
  }
  hash() {
    return Poseidon.hash(this.code.map((c) => c.toField()));
  }
}
export class Message extends Struct({
  message: Provable.Array(Character, 12),
}) {
  public static DEFAULT = Message.from("000000000000");
  public static from(s: string) {
    return new Message({
      message: Provable.Array(Character, 12).fromFields(
        s.split("").map((c) => Character.fromString(c).toField())
      ),
    });
  }
  truncate() {
    return new Message({
      message: Provable.Array(Character, 12).fromFields(
        this.message.map((c) => c.toField())
      ),
    });
  }
  assertLength() {
    for (let i = 0; i < 12; i++)
      this.message[i].isNull().assertFalse("Message Length is not 12");
  }
}
export class EncryptedMessage extends Struct({
  publicKey: Group,
  cipherText: Provable.Array(Field, 13),
}) {
  static DEFAULT = new EncryptedMessage({
    publicKey: Group.zero,
    cipherText: Array.from({ length: 13 }, () => Field(0)),
  });
  static from(message: Message, publicKey: PublicKey) {
    return new EncryptedMessage(
      Encryption.encrypt(
        message.message.map((m) => m.toField()),
        publicKey
      )
    );
  }

  public decrypt(privateKey: PrivateKey) {
    const deepCopy = {
      publicKey: this.publicKey,
      cipherText: this.cipherText.slice(),
    };
    const fields = Encryption.decrypt(deepCopy, privateKey);
    return Provable.Array(Character, 12).fromFields(fields);
  }
}

export class AgentData extends Struct({
  lastMsgNo: MsgNo,
  message: EncryptedMessage,
  securityCodeHash: Field,
}) {
  static from(
    lastMsgNo: MsgNo,
    message: EncryptedMessage,
    securityCodeHash: Field
  ) {
    return new AgentData({ lastMsgNo, message, securityCodeHash });
  }
}
export class MessageValidityProgramOutput extends Struct({
  securityCodeHash: Field,
  encryptedMessage: EncryptedMessage,
}) {}

export const MessageValidityProgram = Experimental.ZkProgram({
  publicInput: PublicKey,
  publicOutput: MessageValidityProgramOutput,
  methods: {
    generate: {
      privateInputs: [Message, SecurityCode],
      method(
        receiverKey: PublicKey,
        message: Message,
        securityCode: SecurityCode
      ) {
        message.assertLength();
        securityCode.assertLength();

        const encryptedMessage = EncryptedMessage.from(message, receiverKey);
        const securityCodeHash = securityCode.hash();
        return {
          encryptedMessage,
          securityCodeHash,
        };
      },
    },
  },
});
export class MessageValidityProgramProof extends Experimental.ZkProgram.Proof(
  MessageValidityProgram
) {}

interface MessagesConfig {
  spyMaster: PublicKey;
}
@runtimeModule()
export class PrivateMessages extends RuntimeModule<MessagesConfig> {
  @state() public store = StateMap.from<PublicKey, AgentData>(
    PublicKey,
    AgentData
  );

  @runtimeMethod()
  public addAgent(agentID: PublicKey, securityCodeHash: Field): void {
    assert(
      this.transaction.sender.value.equals(this.config.spyMaster),
      "You cannot add agents if you are not the spy master"
    );
    assert(this.store.get(agentID).isSome.not(), "Agent already exists");
    const agentData = AgentData.from(
      MsgNo.zero,
      EncryptedMessage.DEFAULT,
      securityCodeHash
    );
    this.store.set(agentID, agentData);
  }

  @runtimeMethod()
  public addMessage(
    msgNo: MsgNo,
    msgValidityProof: MessageValidityProgramProof
  ): void {
    const agentID = this.transaction.sender.value;
    msgValidityProof.verify();
    const { isSome, value: agentData } = this.store.get(agentID);
    assert(isSome, "Agent does not exist");
    assert(
      msgValidityProof.publicInput.equals(this.config.spyMaster),
      "Not encrypted with Spy Master's public key"
    );
    assert(
      msgNo.greaterThan(agentData.lastMsgNo),
      "Message number is not greater than last message number"
    );
    assert(
      msgValidityProof.publicOutput.securityCodeHash.equals(
        agentData.securityCodeHash
      ),
      "Security Code Hash does not match"
    );
    this.store.set(
      agentID,
      AgentData.from(
        msgNo,
        msgValidityProof.publicOutput.encryptedMessage,
        agentData.securityCodeHash
      )
    );
  }
}
