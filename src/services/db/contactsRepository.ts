import { kyselyBuilder, executeKyselyQuery, executeKyselyMutation } from './kyselyConfig';
import { ContactsTable } from '../../types/database';

export class ContactsRepository {
  async findByExpedienteId(expedienteId: string): Promise<ContactsTable[]> {
    const query = kyselyBuilder
      .selectFrom('contacts')
      .selectAll()
      .where('expediente_id', '=', expedienteId)
      .compile();
      
    const result = await executeKyselyQuery<ContactsTable>(query);
    return result.rows;
  }

  async insert(contact: Omit<ContactsTable, 'created_at'>): Promise<void> {
    const query = kyselyBuilder
      .insertInto('contacts')
      .values(contact as any)
      .compile();
      
    await executeKyselyMutation(query);
  }

  async markAsVerified(contactId: string): Promise<void> {
    const query = kyselyBuilder
      .updateTable('contacts')
      .set({ is_verified: 1 })
      .where('id', '=', contactId)
      .compile();
      
    await executeKyselyMutation(query);
  }
}

export const contactsRepository = new ContactsRepository();
