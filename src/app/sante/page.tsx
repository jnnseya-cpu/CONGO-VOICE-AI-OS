import { ModulePage } from "@client/components/voice/ModulePage";
import { IconHeart } from "@client/components/icons";

export const metadata = { title: "Santé AI OS" };

export default function HealthPage() {
  return (
    <ModulePage
      module="health"
      accent="health"
      icon={<IconHeart size={28} />}
      title="Santé AI OS"
      subtitle="Décrivez les symptômes, une grossesse, une maladie d'enfant ou une question de vaccination. Le service vous oriente, détecte les signes de danger et alerte un agent de santé communautaire si nécessaire. Il ne remplace pas un médecin."
      examples={["Mon enfant de 3 ans a de la fièvre depuis deux jours", "Nina mimba na nina damu tangu asubuhi", "Mwana na ngai azali na diarrhée mpe akoki komela te", "Quand vacciner mon bébé de deux mois ?"]}
      tips={["Dites l'âge de la personne et depuis quand cela dure.", "Signalez tout de suite : convulsions, difficulté à respirer, saignement, impossibilité de boire.", "Le centre de santé le plus proche reste votre premier recours en cas de doute.", "Vos échanges sont enregistrés de façon sécurisée et ne sont partagés qu'avec les agents autorisés."]}
    />
  );
}
