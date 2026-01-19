-- Select 5 random records from the Paris budget data
SELECT *
FROM `open-data-france-484717.paris_open_data_dev.comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement`
ORDER BY RAND()
LIMIT 10;
