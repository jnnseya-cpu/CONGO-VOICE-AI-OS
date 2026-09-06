import { ModulePage } from "@client/components/voice/ModulePage";
import { IconGraduation } from "@client/components/icons";

export const metadata = { title: "Éducation AI OS" };

export default function EducationPage() {
  return (
    <ModulePage
      module="education"
      accent="edu"
      icon={<IconGraduation size={28} />}
      title="Éducation AI OS — StudYear Rural"
      subtitle="Apprenez par la voix : explications simples, lecture d'histoires, exercices oraux, révisions pour le TENAFEP et l'Examen d'État, et aide aux parents pour accompagner leurs enfants, dans votre langue."
      examples={["Je ne comprends pas les fractions", "Nalingi koyekola division", "Comment conjuguer le verbe aller au futur ?", "Mon fils de 10 ans a du mal à lire, comment l'aider ?"]}
      tips={["Dites la classe et la matière pour une explication adaptée.", "Après l'explication, faites le petit exercice à voix haute.", "Pour un devoir noté, le service donne des indices et une méthode, pas la réponse finale.", "Les parents peuvent demander un résumé simple de ce que l'enfant étudie."]}
    />
  );
}
