# Setting Up Real Data from data.gov.sg

## Step 1: Create .env File

Create a `.env` file in the project root directory:

```bash
cd /Users/changyuesin/Desktop/sgpropertytrend
touch .env
```

## Step 2: Add Your API Key

Open the `.env` file and add your data.gov.sg API key:

```
DATA_GOV_SG_API_KEY=your-actual-api-key-here
```

**Important:** Replace `your-actual-api-key-here` with your actual API key from data.gov.sg

## Step 3: Fetch Real Data

Run the script to fetch 2025 data:

```bash
source venv/bin/activate
python fetch_datagovsg_data.py
```

## Step 4: Verify Data

The script will:
- Fetch real transaction data from data.gov.sg
- Store it in the database
- Show you how many records were inserted

## Step 5: View Dashboard

Refresh your dashboard at http://localhost:5000 to see the real data!

---

## Note on Dataset Structure

The code assumes a certain dataset structure. If you encounter errors, you may need to:
1. Check the actual dataset resource ID on data.gov.sg
2. Verify the field names in the dataset
3. Update the `parse_and_store_datagovsg_transactions()` function accordingly

## Fetching Multiple Years

To fetch data for multiple years, edit `fetch_datagovsg_data.py` and change:
```python
years = [2025]  # Change to [2023, 2024, 2025] for multiple years
```

