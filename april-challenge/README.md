## March Challenge
### An answer to the question regarding privacy
On Protokit the proofs are created on the server. This means the `messageDetails` is **NOT** private. 

However, we know that the information is only known to the agent and the protokit server.

One solution:

1. agents store encrypted data on the server (using agents public key).
2. spymaster (assumed to have creds of every agent) can decrypt the messages.
3. the agents however need to generate a proof on their own to convince the server that know a valid `agentID` and `securityCode` pair, along with `msgLength` of 12.
4. the server can check that `msgNumber` is the highest till now. 

Using protokit, we have separated the computation heavy tasks from the frontend/UX simplifying the app structure.  
   
