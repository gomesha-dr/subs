import { redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { CreateMatchForm } from './CreateMatchForm';

export default async function NewMatchPage() {
  const id = await getCurrentPlayerId();
  if (!id) redirect('/');
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <CreateMatchForm />
    </div>
  );
}
