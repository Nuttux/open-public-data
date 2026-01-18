#!/usr/bin/env python3
"""Upload CSV to BigQuery with cleaned column names"""

from google.cloud import bigquery
import os
import unicodedata
import re
import pandas as pd

# Set credentials
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/theotortorici/Documents/customer-repos/open-public-data/open-data-france-484717-68f33f082f1f.json"

# Config
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "paris_open_data_dev"
TABLE_ID = "comptes_administratifs_budgets"
CSV_FILE = "/Users/theotortorici/Documents/customer-repos/open-public-data/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement.csv"


def clean_column_name(name):
    """Clean column name: lowercase, no accents, no spaces/slashes/parentheses"""
    # Remove accents
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    # Lowercase
    name = name.lower()
    # Replace spaces, slashes, parentheses with underscore
    name = re.sub(r'[\s/\(\)]+', '_', name)
    # Replace any other non-alphanumeric chars with underscore
    name = re.sub(r'[^a-z0-9_]', '_', name)
    # Collapse multiple underscores
    name = re.sub(r'_+', '_', name)
    # Strip leading/trailing underscores
    name = name.strip('_')
    return name


# Initialize client
client = bigquery.Client(project=PROJECT_ID)

# Create dataset if it doesn't exist
dataset_ref = f"{PROJECT_ID}.{DATASET_ID}"
try:
    client.get_dataset(dataset_ref)
    print(f"Dataset {DATASET_ID} already exists")
except Exception:
    dataset = bigquery.Dataset(dataset_ref)
    dataset.location = "EU"
    client.create_dataset(dataset)
    print(f"Created dataset {DATASET_ID}")

# Read CSV and clean column names
print(f"Reading {CSV_FILE}...")
df = pd.read_csv(CSV_FILE, delimiter=";")

# Show original vs cleaned column names
print("\nColumn name mapping:")
new_columns = {}
for col in df.columns:
    new_name = clean_column_name(col)
    new_columns[col] = new_name
    print(f"  {col} -> {new_name}")

df.rename(columns=new_columns, inplace=True)

# Upload to BigQuery
table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"
print(f"\nUploading to {table_ref}...")

job_config = bigquery.LoadJobConfig(
    write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
)

job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
job.result()

# Get table info
table = client.get_table(table_ref)
print(f"\n✓ Loaded {table.num_rows:,} rows to {table_ref}")
print(f"\nSchema:")
for field in table.schema:
    print(f"  - {field.name}: {field.field_type}")
