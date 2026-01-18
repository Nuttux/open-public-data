# Paris Public Open Data - dbt Project

This dbt project transforms Paris Open Data for analytics and reporting.

## Project Structure

```
paris-public-open-data/
├── models/
│   ├── staging/          # Clean and standardize raw data
│   └── marts/            # Business logic transformations
├── seeds/                # Static CSV data files
├── macros/               # Reusable SQL snippets
├── snapshots/            # Track slowly changing dimensions
├── tests/                # Custom data tests
└── analyses/             # Ad-hoc analytical queries
```

## Setup

### 1. Configure BigQuery Connection

Edit `profiles.yml` and replace:
- `your-gcp-project-id` with your GCP project ID
- Update the `keyfile` path for production

### 2. Authenticate with GCP

For local development with OAuth:
```bash
gcloud auth application-default login
```

For production, use a service account keyfile.

### 3. Install Dependencies

```bash
dbt deps
```

### 4. Test Connection

```bash
dbt debug
```

### 5. Run Models

```bash
# Run all models
dbt run

# Run specific models
dbt run --select staging

# Run with full refresh
dbt run --full-refresh
```

## Commands

| Command | Description |
|---------|-------------|
| `dbt run` | Execute models |
| `dbt test` | Run tests |
| `dbt build` | Run models + tests |
| `dbt docs generate` | Generate documentation |
| `dbt docs serve` | Serve documentation locally |

## Data Sources

Data is sourced from [Paris Open Data](https://opendata.paris.fr/).

## Resources

- [dbt Documentation](https://docs.getdbt.com/)
- [BigQuery Setup](https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup)
- [Paris Open Data Portal](https://opendata.paris.fr/)
