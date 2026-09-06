import { ModulePage } from "@client/components/voice/ModulePage";
import { IconLeaf } from "@client/components/icons";

export const metadata = { title: "Agriculture AI OS" };

export default function AgriculturePage() {
  return (
    <ModulePage
      module="agriculture"
      accent="agri"
      icon={<IconLeaf size={28} />}
      title="Agriculture AI OS"
      subtitle="Parlez de vos cultures, envoyez une photo des feuilles, du sol ou d'un animal malade. Le service identifie le problème probable, propose d'abord des actions gratuites ou peu coûteuses, et prévient l'agent agricole de votre secteur si le risque est important."
      examples={["Les feuilles de mon manioc jaunissent et se recroquevillent", "Mahindi yangu yana viwavi kwenye majani", "Quand planter le maïs avec les pluies qui commencent ?", "Mes chèvres ont la diarrhée, deux sont mortes"]}
      tips={["Prenez une photo nette, en plein jour, de la feuille ou de l'animal touché, puis une vue d'ensemble du champ.", "Dites la culture, l'âge des plants et la part du champ touchée.", "Aucun produit chimique n'est recommandé sans avis d'un agent qualifié.", "Les prix de marché sont donnés à titre indicatif avec leur date et leur source."]}
    />
  );
}
