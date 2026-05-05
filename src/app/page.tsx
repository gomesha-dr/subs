import { getCurrentPlayerId } from '@/lib/session';
import { getPlayerById, listAllNames, listPublicPlayers } from '@/lib/players';
import { WelcomeForm } from './_components/WelcomeForm';
import { MyProfileCard } from './_components/MyProfileCard';
import { TeamList } from './_components/TeamList';

export default async function Home() {
  const currentId = await getCurrentPlayerId();
  const me = currentId ? await getPlayerById(currentId) : null;

  if (!me) {
    const existingNames = await listAllNames();
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <WelcomeForm existingNames={existingNames} />
      </div>
    );
  }

  const players = await listPublicPlayers();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-md p-4 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Subs</h1>
          <p className="text-sm text-gray-500">7-a-side rotation</p>
        </header>
        <MyProfileCard player={me} />
        <TeamList players={players} currentId={me.id} />
      </div>
    </div>
  );
}
