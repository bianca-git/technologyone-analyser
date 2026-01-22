# AFRG_I&E_BALANCES
**ID:** a9463781-21f6-4ccb-a359-2d6ed336419e | **Owner:** BWILKINS | **Ver:** 1
> AFRG extract Income and Expense Balances

## Process Steps
### Create Table: Create Variables Hold Table
   > **Context:** Sets up a temporary container ('target') to hold data during processing.
   * Table: TEMP_VAR_PARENT

### Loop: Loop
   > **Context:** Starts a repeating cycle. Everything indented below runs multiple times (once for each item).
   > *Note: {&VAR_LOOPINDEX}<={&VAR_LOOPEND}*
   * Condition: {&VAR_LOOPINDEX}<={&VAR_LOOPEND}
   * Variable: VAR_LOOPINDEX

  └─ Create Table: Create Table
     > **Context:** Sets up a temporary container ('target') to hold data during processing.
     * Table: TEMP_LEDGER_VARS

  └─ Append Data: Append Table
     > **Context:** Stacks data from 'TEMP_LEDGER_VARS' onto the bottom of 'TEMP_VAR_PARENT'.
     * Append: TEMP_LEDGER_VARS -> TEMP_VAR_PARENT

  └─ Clear Temp Table: Purge Table
     > **Context:** Empties the temporary table 'dataset' to free up memory.
     * Table: TEMP_LEDGER_VARS

### Extract Data: Run Direct Query to GLF_LDG_ACCT_PBAL
   > **Context:** Connects to the source system to pull raw data from 'GLF_LDG_ACCT_PBAL'.
   * From: TB.GLF_LDG_ACCT_PBAL
   * Columns (5): VERSION, LDG_NAME, ACCNBRI, PERIOD, BAL_AMT1
   * Filter: BAL_AMT1 NotEquals 

### Calculate Fields: Add Columns
   > **Context:** Calculates new values (columns) for the data in 'AFRG_B_BALANCES_RAW'.
   * In Table: AFRG_B_BALANCES_RAW

   | Field | Formula |
   | --- | --- |
   | COSTCEN | Left([ACCNBRI], 6) |
   | ACTIVITY | Right(Left([ACCNBRI],9),3) |
   | NATACCT | Right([ACCNBRI],4) |
   | LDG_TYPE | Right(Left([LDG_NAME],5),3) |


### Delete Data: Warehouse Table - Delete Data
   > **Context:** Removes specific records from '[object Object]' (often to clear old data before reloading).
   * Table: AFRG_IE_BALANCES

### Load to Warehouse: Warehouse Table - Import Data
   > **Context:** Finalizes the process by saving data into the '[object Object]' table.
   * To Table: AFRG_IE_BALANCES
   * Method: Insert and Update

   | Source Field | Target Field |
   | --- | --- |
   | [VERSION] | VERSION |
   | [LDG_NAME] | LDG_NAME |
   | [PERIOD] | PERIOD |
   | [BAL_AMT1] | BAL_AMT1 |
   | [COSTCEN] | COSTCEN |
   | [ACTIVITY] | ACTIVITY |
   | [NATACCT] | NATACCT |
   | [LDG_TYPE] | LDG_TYPE |
   | [ACCNBRI] | ACCOUNT_CODE |


### Clear Temp Table: Purge All Tables No Longer Required
   > **Context:** Empties the temporary table 'dataset' to free up memory.
   * Table: TEMP_VAR_PARENT

## Output Columns
`VERSION`, `LDG_NAME`, `PERIOD`, `BAL_AMT1`, `COSTCEN`, `ACTIVITY`, `NATACCT`, `LDG_TYPE`, `ACCOUNT_CODE`