#!/usr/bin/env tsx
import { qdrant, COLLECTION } from '../lib/qdrant';

async function main() {
  const collectionName = `cbse_class10_v1_te3small_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`;

  console.log(`Creating versioned collection: ${collectionName}...`);

  try {
    // 1. Create collection with 1536 dims (text-embedding-3-small dimension)
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 1536,
        distance: 'Cosine',
      },
    });
    console.log(`Collection ${collectionName} created successfully.`);

    // 2. Create payload indexes for fast filtering
    const fieldsToIndex = [
      { name: 'subject', schema: 'keyword' as const },
      { name: 'chapterNumber', schema: 'integer' as const },
      { name: 'language', schema: 'keyword' as const },
      { name: 'reviewed', schema: 'bool' as const },
      { name: 'contentType', schema: 'keyword' as const },
      { name: 'curriculumVersion', schema: 'keyword' as const },
    ];

    for (const field of fieldsToIndex) {
      console.log(`Creating payload index on field "${field.name}"...`);
      await qdrant.createPayloadIndex(collectionName, {
        field_name: field.name,
        field_schema: field.schema,
      });
    }
    console.log('All payload indexes created.');

    // 3. Create or update the alias
    console.log(`Updating alias "${COLLECTION}" to point to ${collectionName}...`);
    
    // Check if alias exists and remove it first to point to the new collection
    const aliasesResult = await qdrant.getAliases();
    const actions: Array<
      | { create_alias: { alias_name: string; collection_name: string } }
      | { delete_alias: { alias_name: string } }
    > = [];
    
    for (const alias of aliasesResult.aliases) {
      if (alias.alias_name === COLLECTION) {
        actions.push({
          delete_alias: {
            alias_name: COLLECTION,
          },
        });
      }
    }
    
    actions.push({
      create_alias: {
        alias_name: COLLECTION,
        collection_name: collectionName,
      },
    });

    await qdrant.updateCollectionAliases({ actions });
    console.log(`Alias "${COLLECTION}" now points to ${collectionName}.`);
    console.log('Qdrant setup completed successfully!');
  } catch (error) {
    console.error('Error setting up Qdrant:', error);
    process.exit(1);
  }
}

main();
