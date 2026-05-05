import { redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { getPlayerById } from '@/lib/players';
import { EditProfileForm } from './EditProfileForm';

export default async function EditMyProfilePage() {
  const id = await getCurrentPlayerId();
  if (!id) redirect('/');
  const me = await getPlayerById(id);
  if (!me) redirect('/');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <EditProfileForm player={me} />
    </div>
  );
}
