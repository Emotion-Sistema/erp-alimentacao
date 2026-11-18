export type EmConstrucaoProps = {
  titulo: string;
  etapa: string;
  oQueVem: string;
};

/** Tela que ainda não existe: diz, em linguagem simples, quando chega e o que vai fazer. */
export function EmConstrucao({ titulo, etapa, oQueVem }: EmConstrucaoProps) {
  return (
    <section className="erp-cartao erp-em-construcao">
      <h1>{titulo}</h1>
      <p className="erp-em-construcao__etapa">
        Esta tela chega na etapa {etapa}.
      </p>
      <p>O que ela vai fazer: {oQueVem}</p>
    </section>
  );
}
