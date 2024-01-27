import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Permissions,
  MerkleMap,
  MerkleMapWitness,
  PublicKey,
  Poseidon,
  AccountUpdate,
  Bool,
} from 'o1js';
export class Solution extends SmartContract {
  @state(PublicKey) adminAddress = State<PublicKey>();
  /**
   * maps Hash(publicAddress) -> Field(is an eligible address 1, else 0)
   * @type {State<Field>}
   */
  @state(Field) addressesMerkleRoot = State<Field>();
  @state(Field) addressesCount = State<Field>();

  /**
   * maps Hash(eligibleAddress) -> Field(message)
   */
  @state(Field) messagesMerkleRoot = State<Field>();
  @state(Field) messageCount = State<Field>();

  events = {
    'received-message': Field,
  };

  init() {
    super.init();
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
    //set up merkle map and intial state of the contract
    const map = new MerkleMap();
    this.addressesMerkleRoot.set(map.getRoot());
    this.messagesMerkleRoot.set(map.getRoot());
    this.addressesCount.set(Field(0));
    this.messageCount.set(Field(0));
  }

  /**
   * verify this.sender inside proof
   * https://discord.com/channels/484437221055922177/1185288593099456565/1198538012141813760
   */
  getVerifiedSender() {
    AccountUpdate.create(this.sender).requireSignature();
    return this.sender;
  }

  deploy() {
    super.deploy();
    const verifiedSender = this.getVerifiedSender();
    this.adminAddress.set(verifiedSender);
  }

  /**
   * stores eligible addresses in the merkle map
   *
   * can only called by Admin
   */
  @method storeEligibleAddress(
    newAddress: PublicKey,
    newAddressWitness: MerkleMapWitness
  ) {
    const verifiedSender = this.getVerifiedSender();
    verifiedSender.assertEquals(this.adminAddress.getAndRequireEquals());

    const addressCount = this.addressesCount.getAndRequireEquals();
    addressCount.assertLessThan(101, 'a maximum of 100 eligible addresses');

    // verify that hash(newAddress) contains 0  , meaning it is not eligible
    const addressesRoot = this.addressesMerkleRoot.getAndRequireEquals();
    const [oldRoot, key] = newAddressWitness.computeRootAndKey(Field(0));
    addressesRoot.assertEquals(oldRoot);
    Poseidon.hash(newAddress.toFields()).assertEquals(key);

    // update the map to include the new address as eligible
    const [newRoot] = newAddressWitness.computeRootAndKey(Field(1));
    this.addressesMerkleRoot.set(newRoot);

    this.addressesCount.set(addressCount.add(Field(1)));
  }

  /**
   * A user with an eligible address can deposit a secret
   * message of a certain format.
   * @param message
   * @param addressWitness
   * @param messageWitness
   */
  @method checkAndStoreMessage(
    message: Field,
    addressWitness: MerkleMapWitness,
    messageWitness: MerkleMapWitness
  ) {
    const verifiedSender = this.getVerifiedSender();

    const addressesRoot = this.addressesMerkleRoot.getAndRequireEquals();
    const messagesRoot = this.messagesMerkleRoot.getAndRequireEquals();
    const messageCount = this.messageCount.getAndRequireEquals();

    const [computedAddressRoot, addressWitnessKey] =
      addressWitness.computeRootAndKey(Field(1));
    //check if the addressWitness is valid
    addressesRoot.assertEquals(
      computedAddressRoot,
      'merkle root does not match'
    );
    //and the sender is present in the merkle map
    Poseidon.hash(verifiedSender.toFields()).assertEquals(
      addressWitnessKey,
      'sender is not eligible'
    );

    //check if the message slot has -1, meaning it is unused
    const [computedMessageRoot, messageWitnessKey] =
      messageWitness.computeRootAndKey(Field(0));
    computedMessageRoot.assertEquals(
      messagesRoot,
      'message is already present'
    );
    //we have used the correct slot
    Poseidon.hash(verifiedSender.toFields()).assertEquals(
      messageWitnessKey,
      'message is not for this sender'
    );

    this.verifyMessageFlags(message);

    //update the message merkle map to contain the message
    const [newMessageRoot] = messageWitness.computeRootAndKey(message);
    this.messagesMerkleRoot.set(newMessageRoot);
    //update the message count
    this.messageCount.set(messageCount.add(1));
    // emit events
    this.emitEvent('received-message', message);
  }
  verifyMessageFlags(message: Field) {
    const [flag6, flag5, flag4, flag3, flag2, flag1] = message.toBits();
    flag1
      .not()
      .or(
        [
          flag2.not(),
          flag3.not(),
          flag4.not(),
          flag5.not(),
          flag6.not(),
        ].reduce(Bool.and)
      )
      .assertTrue('flag1 is true implies others are false');
    flag2
      .not()
      .or(flag3)
      .assertTrue('flag2 is true implies flag3 must also be true');
    flag4
      .not()
      .or([flag5, flag6].reduce(Bool.and))
      .assertTrue('flag4 is true implies flag5 and flag6 must also be true');
  }
}
