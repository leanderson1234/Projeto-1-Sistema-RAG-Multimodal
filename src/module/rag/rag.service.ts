import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

@Injectable()
export class RagService implements OnModuleInit {
  private model;
  private embeddings;
  private vectorStore;
  private cache = new Map<string, string>();

  async onModuleInit() {
    this.model = new ChatOllama({
      model: 'phi3',
      temperature: 0,
      numPredict: 80,
    });

    this.embeddings = new OllamaEmbeddings({
      model: 'nomic-embed-text',
    });

    this.vectorStore = await Chroma.fromExistingCollection(
      this.embeddings,
      {
        collectionName: 'rag-collection',
        url: 'http://localhost:8000',
      },
    );
  }

  async perguntar(pergunta: string, categoria?: string) {
    const start = Date.now();

    const key = this.gerarCacheKey(pergunta, categoria);

    const cache = this.buscarCache(key);
    if (cache) return cache;

    const resultados = await this.buscarContexto(pergunta, categoria);

    const relevantes = this.filtrarRelevantes(resultados);

    if (!relevantes.length) {
      return { resposta: 'Não encontrado no documento' };
    }

    const contexto = this.montarContexto(relevantes);

    if (!contexto) {
      return { resposta: 'Nenhum conteúdo válido encontrado' };
    }

    const resposta = await this.gerarResposta(contexto, pergunta);

    const resultadoFinal = this.montarRespostaFinal(resposta, relevantes);

    this.salvarCache(key, resultadoFinal);

    console.log('Tempo:', Date.now() - start, 'ms');

    return resultadoFinal;
  }

  private gerarCacheKey(pergunta: string, categoria?: string) {
    return `${categoria || 'all'}:${pergunta}`;
  }

  private buscarCache(key: string) {
    return this.cache.get(key);
  }

  private salvarCache(key: string, valor: any) {
    this.cache.set(key, valor);
  }

  private async buscarContexto(pergunta: string, categoria?: string) {
    return this.vectorStore.similaritySearchWithScore(
      pergunta,
      3,
      categoria ? { categoria } : undefined,
    );
  }

  private filtrarRelevantes(resultados: any[]) {
    return resultados.filter(([_, score]) => score < 0.4);
  }

  private montarContexto(relevantes: any[]) {
    return relevantes
      .map(([doc]) => doc.pageContent)
      .filter(
        (text) =>
          typeof text === 'string' && text.trim().length > 0,
      )
      .slice(0, 2)
      .join('\n');
  }

  private async gerarResposta(contexto: string, pergunta: string) {
    const prompt = `
    Responda de forma objetiva em até 5 linhas.

    Se não estiver no contexto, diga:
    "Não encontrado no documento".

    NÃO invente informações.

    CONTEXTO:
    ${contexto}

    PERGUNTA:
    ${pergunta}
    `;

    const response = await this.model.invoke([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    return String(response.content);
  }

  private montarRespostaFinal(resposta: string, relevantes: any[]) {
    return {
      resposta,
      fontes: relevantes.map(([doc]) => ({
        arquivo: doc.metadata?.arquivo || null,
        pagina: doc.metadata?.pagina || null,
        trecho: doc.pageContent.slice(0, 100),
      })),
    };
  }

  async adicionar(texto: string, categoria: string) {
    const id = uuidv4();

    await this.vectorStore.addDocuments([
      {
        pageContent: texto,
        metadata: {
          id,
          categoria,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    return { id };
  }

  async listar() {
    const results = await this.vectorStore.similaritySearch(' ', 20);

    return results.map((r) => ({
      texto: r.pageContent,
      metadata: r.metadata,
    }));
  }

  async deletar(id: string) {
    await this.vectorStore.delete({
      filter: { id },
    });

    return { message: 'Deletado com sucesso' };
  }

  async processarUpload(
    file?: Express.Multer.File,
    texto?: string,
    categoria?: string,
  ) {
    let documentos: any[] = [];

    // PDF
    if (file) {
      const tempPath = `./temp/${file.originalname}`;

      fs.writeFileSync(tempPath, file.buffer);

      const loader = new PDFLoader(tempPath);
      const docs = await loader.load();

      documentos.push(...docs);

      fs.unlinkSync(tempPath);
    }

    // Texto manual
    if (texto && texto.trim().length > 0) {
      documentos.push({
        pageContent: String(texto),
        metadata: {},
      });
    }

    if (documentos.length === 0) {
      return { message: 'Nenhum conteúdo enviado' };
    }

    const splitDocs = await this.dividirDocumentos(documentos);

    const docsValidos = this.filtrarDocumentosValidos(splitDocs);

    if (docsValidos.length === 0) {
      return {
        message: 'Nenhum conteúdo válido encontrado',
      };
    }

    const finalDocs = this.prepararDocumentos(
      docsValidos,
      categoria,
      file?.originalname,
    );

    await this.vectorStore.addDocuments(finalDocs);

    return {
      message: 'Upload processado com sucesso',
      totalChunks: finalDocs.length,
    };
  }

  private async dividirDocumentos(documentos: any[]) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });

    return splitter.splitDocuments(documentos);
  }

  private filtrarDocumentosValidos(docs: any[]) {
    return docs.filter(
      (doc) =>
        typeof doc.pageContent === 'string' &&
        doc.pageContent.trim().length > 0,
    );
  }

  private prepararDocumentos(
    docs: any[],
    categoria?: string,
    arquivo?: string,
  ) {
    return docs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: {
        id: uuidv4(),
        categoria: categoria || 'geral',
        arquivo: arquivo || 'texto',
        pagina: doc.metadata?.loc?.pageNumber || null,
        createdAt: new Date().toISOString(),
      },
    }));
  }
}