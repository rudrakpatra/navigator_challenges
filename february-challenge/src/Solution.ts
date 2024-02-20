import {
    Field,
    SmartContract,
    state,
    State,
    method,
    UInt64,
    Reducer,
    Provable,
    Struct,
    Bool,
  } from 'o1js';


  export class Message extends Struct({
    messageNum :UInt64,
    AgentID :UInt64,
    AgentXLocation : UInt64,
    AgentYLocation : UInt64,
    CheckSum : UInt64,
  }) {
    static from(
      messageNum: UInt64,
      AgentID: UInt64,
      AgentXLocation: UInt64,
      AgentYLocation: UInt64,
      CheckSum: UInt64
    ): Message {
      return new Message({
        messageNum,
        AgentID: AgentID,
        AgentXLocation: AgentXLocation,
        AgentYLocation: AgentYLocation,
        CheckSum: CheckSum,
      });
    }
    isValid(){
        return this.AgentID.equals(UInt64.zero).or(
        [
            // CheckSum is the sum of Agent ID , Agent XLocation and Agent YLocation
            this.CheckSum.equals(this.AgentID.add(this.AgentXLocation).add(this.AgentYLocation)),
            // the 4 message details numbers are in the correct range
            this.AgentID.lessThanOrEqual(UInt64.from(3000)),
            this.AgentXLocation.lessThanOrEqual(UInt64.from(15000)),
            this.AgentYLocation.greaterThanOrEqual(UInt64.from(5000)),
            this.AgentYLocation.lessThanOrEqual(UInt64.from(20000)),
            // Agent YLocation should be greater than AgentXLocation
            this.AgentYLocation.greaterThan(this.AgentXLocation),
        ].reduce(Bool.and))
    }
  }


  export class Solution extends SmartContract {
    @state(UInt64) highestMessageNumber = State<UInt64>();
    @state(Field) actionState = State<Field>();
  
    reducer = Reducer({ actionType: Message });
  
    init() {
      super.init();
      this.highestMessageNumber.set(UInt64.from(0));
    }
  
    @method processMessage() {
      const highestMessageNumber = this.highestMessageNumber.getAndRequireEquals();
      const actionState = this.actionState.getAndRequireEquals();
  
      const pendingMessages = this.reducer.getActions({
        fromActionState: actionState,
      });
      const { state: newHighestMessageNumber, actionState: newActionState } =
        this.reducer.reduce(
          pendingMessages,
          UInt64,
          (state: UInt64, message: Message) => 
                Provable.if(
                    message.isValid().and(
                        message.messageNum.greaterThan(state)
                    ),
                    message.messageNum,
                    state
                )
          ,
          {
            state: highestMessageNumber,
            actionState: actionState,
          },
          {
            maxTransactionsWithActions: 200,
          }
        );
      this.highestMessageNumber.set(newHighestMessageNumber);
      this.actionState.set(newActionState);
    }
  
    @method postMessage(
        message: Message
    ) {
      // dispatch action
      this.reducer.dispatch(message);
    }
  }
  