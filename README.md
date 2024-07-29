# workflow-orchestration-tools



## Worflow
```mermaid
flowchart TD
    A[User submits tool] --> B{Reserve slot}
    B -->|Success| C[Create pending submission]
    C --> D[Start toolSubmissionWorkflow]
    D --> E{Receive submission data}
    E -->|Timeout| F[Cancel submission]
    E -->|Received| G[Move to review]
    G --> H{External: Validate URL}
    H -->|Invalid| I[Reject tool]
    H -->|Valid| J[Approve tool]
```


## Potential Issues and Mitigations

The `toolSubmissionWorkflow` addresses several potential issues:

1. **Slot Contention**: 
   - Issue: Multiple users attempting to reserve the same slot simultaneously.
   - Mitigation: Unique database constraint on active slots ensures atomic reservations.

2. **Abandoned Submissions**: 
   - Issue: Users starting but not completing tool submissions.
   - Mitigation: Timeout mechanism automatically cancels incomplete submissions.

3. **Application Crashes**: 
   - Issue: System failures during workflow execution.
   - Mitigation: DBOS's recovers workflow from last consistent state.

4. **Duplicate Submissions**: 
   - Issue: Network issues causing multiple submissions of the same tool.
   - Mitigation: Workflow UUID used as idempotency key to prevent duplicate processing.

5. **Data Inconsistency**: 
   - Issue: Database operations failing mid-workflow.
   - Mitigation: DBOS's transactional execution ensures atomic database operations within workflows.

## Use Case: User Abandons

```mermaid
sequenceDiagram
    actor User
    participant Server as DBOS Server
    participant DB as Database

    User->>Server: Request slot
    Server->>DB: Reserve slot
    DB-->>Server: Slot reserved
    Server-->>User: Slot granted

    Note over User,Server: User abandons submission

    Note over Server: Timeout (120s)
    Server->>DB: Cancel reservation
    DB-->>Server: Slot released

    Note over DB: Slot available again
```


## Use Case: Two Users Want Same Slot

```mermaid
sequenceDiagram
    participant User1 as User 1
    participant User2 as User 2
    participant App as Application Server
    participant DB as Database

    User1->>App: Request to reserve slot 3
    User2->>App: Request to reserve slot 3
    
    App->>DB: Attempt to insert pending tool for User 1 (slot 3)
    DB-->>App: Insert successful
    App-->>User1: Slot 3 reserved

    Note over App,DB: Unique constraint ensures<br/>only one insert can succeed

    App->>DB: Attempt to insert pending tool for User 2 (slot 3)
    DB-->>App: Insert fails (unique constraint violation)
    App-->>User2: Slot 3 not available, try another

    Note over User1,User2: User 1 gets the slot,<br/>User 2 must choose a different slot
```

## Use Case: Validating Submissions

```mermaid
sequenceDiagram
    participant W as Workflow
    participant D as Database
    participant V as External URL Validator

    Note over W: toolSubmissionWorkflow starts
    W->>D: Retrieve tool details
    W->>V: Send URL for validation
    Note over W,V: Asynchronous operation
    W->>D: Update tool status to 'in_review'
    V-->>W: Validation result (after delay)
    alt URL is valid
        W->>D: Update tool status to 'approved'
    else URL is invalid
        W->>D: Update tool status to 'rejected'
    end
    Note over W: Workflow completes
```

## Code Layout

```mermaid
graph TD
    A[Browser] -->|HTTP Requests| B[DBOS SDK Server]
    B -->|Static Files| C[/public/]
    B -->|API Requests| D[API Endpoints<br>src/operations.ts]
    D -->|Database Operations| E[PostgreSQL Database]
    B -->|Dynamic Content| F[Liquid Templates<br>public/*.liquid]
    D --> G[ShopUtilities<br>src/utilities.ts]
    G --> E
    H[dbos-config.yaml] -->|Config| B
    H -->|DB Config| E
    I[package.json] -->|Dependencies| B
    J[knexfile.ts] -->|DB Migration| E
    K[src/frontend.ts] --> F

    subgraph "Backend"
        D
        G
    end

    subgraph "Frontend"
        C
        F
    end
```
