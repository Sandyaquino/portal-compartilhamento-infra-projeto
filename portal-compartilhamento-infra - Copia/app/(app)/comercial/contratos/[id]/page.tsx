"use client";

import { useParams } from "next/navigation";

import { ProvedorContratoView } from "@/components/comercial/provedor-contrato-view";

export default function GestaoContratoPage() {
  const params = useParams();
  const id = params.id as string;

  return <ProvedorContratoView id={id} origem="contratos" abaInicial="contrato" />;
}
