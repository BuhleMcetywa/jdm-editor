import { CloudDownloadOutlined, CloudUploadOutlined, CloudServerOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Button, Dropdown, Tooltip, message } from 'antd';
import React, { useRef } from 'react';
import { exportExcelFile, readFromExcel } from '../../../helpers/excel-file-utils';
import { decisionModelSchema } from '../../../helpers/schema';
import { useDecisionGraphActions, useDecisionGraphRaw, useDecisionGraphState } from '../context/dg-store.context';
import { type DecisionEdge, type DecisionNode } from '../dg-types';
import { NodeKind } from '../nodes/specifications/specification-types';

const DecisionContentType = 'application/vnd.gorules.decision';

// API endpoint configuration

const API_ENDPOINT = import.meta.env.VITE_UPLOAD_ENDPOINT ?? 'http://localhost:5000/api/proxy/jdm/decisions';

export type GraphSideToolbarProps = {
  //
};

export const GraphSideToolbar: React.FC<GraphSideToolbarProps> = () => {
  const decisionGraphRaw = useDecisionGraphRaw();
  const fileInput = useRef<HTMLInputElement>(null);
  const excelFileInput = useRef<HTMLInputElement>(null);

  const { setDecisionGraph, setActivePanel } = useDecisionGraphActions();
  const { disabled, panels, activePanel } = useDecisionGraphState(({ disabled, panels, activePanel }) => ({
    disabled,
    panels,
    activePanel,
  }));

  const handleUploadInput = async (event: any) => {
    const fileList = event?.target?.files as FileList;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed: any = JSON.parse(e?.target?.result as string);
        if (parsed?.contentType !== DecisionContentType) {
          throw new Error('Invalid content type');
        }

        const nodes: DecisionNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        const nodeIds = nodes.map((node) => node.id);

        const edges: DecisionEdge[] = (parsed.edges as DecisionEdge[]).filter(
          (edge) => nodeIds.includes(edge?.targetId) && nodeIds.includes(edge?.sourceId),
        );

        const modelParsed = decisionModelSchema.safeParse({
          nodes,
          edges,
          settings: parsed?.settings,
        });

        if (!modelParsed.success) {
          console.log(modelParsed.error?.message);
          message.error(modelParsed.error?.message);
          return;
        }

        setDecisionGraph(modelParsed.data);
      } catch (e: any) {
        message.error(e.message);
      }
    };

    reader.readAsText(Array.from(fileList)?.[0], 'UTF-8');
  };

  const uploadJDMExcel = (event: any) => {
    const file = event?.target?.files[0];
    const fileReader = new FileReader();

    try {
      fileReader.readAsArrayBuffer(file);
      fileReader.onload = async () => {
        const buffer = fileReader.result as ArrayBuffer;

        if (!buffer) return;

        const nodesFromExcel = await readFromExcel(buffer);

        const { decisionGraph } = decisionGraphRaw.stateStore.getState();
        const updatedNodes = decisionGraph.nodes.map((node) => {
          let _node = node;
          // updating existing nodes
          nodesFromExcel.forEach((excelNode) => {
            if (excelNode.id === node.id) _node = { ...node, content: excelNode.content };
          });

          return _node;
        });

        // filtering new nodes and setting them proper position
        const newNodes = nodesFromExcel
          .filter((node) => !updatedNodes.some((existingNode) => existingNode.id === node.id))
          .map((newNode, index) => ({ ...newNode, position: { x: index * 250, y: 0 } }));

        const modelParsed = decisionModelSchema.safeParse({
          nodes: [...updatedNodes, ...newNodes],
          edges: decisionGraph.edges,
          settings: decisionGraph.settings,
        });

        if (!modelParsed.success) {
          console.log(modelParsed.error?.message);
          message.error(modelParsed.error?.message);
          return;
        }

        setDecisionGraph(modelParsed.data);
        message.success('Excel file has been uploaded successfully!');
      };
    } catch {
      message.error('Failed to upload Excel!');
    }
  };

  // New function to upload JSON to an endpoint
  const uploadToEndpoint = async () => {
    try {
      const { name } = decisionGraphRaw.stateStore.getState();
      const { decisionGraph } = decisionGraphRaw.stateStore.getState();
      
      // Validate the decision graph against schema
      const modelParsed = decisionModelSchema.safeParse({
        nodes: decisionGraph.nodes,
        edges: decisionGraph.edges,
        settings: decisionGraph.settings,
      });

      if (!modelParsed.success) {
        console.log(modelParsed.error?.message);
        message.error(modelParsed.error?.message);
        return;
      }
      
      // Prepare data for upload
      const graphId = name.replaceAll('.json', '');
      const timestamp = new Date().toISOString();
      
      const payload = {
        id: graphId,
        timestamp,
        name: graphId,
        contentType: DecisionContentType,
        data: {
          nodes: decisionGraph.nodes,
          edges: decisionGraph.edges,
          settings: decisionGraph.settings,
        }
      };
      
      // Send to API endpoint
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Server responded with status: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      message.success('Decision graph successfully uploaded to server!');
      return responseData;
    } catch (e: any) {
      console.error('Upload error:', e);
      message.error(`Failed to upload: ${e.message}`);
    }
  };

  // New function to handle file upload to endpoint
  const uploadFileToEndpoint = async () => {
    try {
      // Prompt for file selection
      fileInput.current?.click();
      
      // The actual upload will happen in a separate function after file selection
    } catch (e: any) {
      message.error(`Failed to start file upload: ${e.message}`);
    }
  };

  // Function to handle the file selection and upload to endpoint
  const handleFileUploadToEndpoint = async (event: any) => {
    const fileList = event?.target?.files as FileList;
    if (!fileList || fileList.length === 0) return;
    
    const file = fileList[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      message.loading('Validating and uploading file...');
      
      // First, validate the file
      const reader = new FileReader();
      
      // Create a promise to handle the file reading
      const readFilePromise = new Promise<any>((resolve, reject) => {
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            const parsed = JSON.parse(content);
            
            if (parsed?.contentType !== DecisionContentType) {
              reject(new Error('Invalid content type'));
              return;
            }
            
            const nodes: DecisionNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
            const nodeIds = nodes.map((node) => node.id);
            
            const edges: DecisionEdge[] = (parsed.edges as DecisionEdge[]).filter(
              (edge) => nodeIds.includes(edge?.targetId) && nodeIds.includes(edge?.sourceId),
            );
            
            const modelParsed = decisionModelSchema.safeParse({
              nodes,
              edges,
              settings: parsed?.settings,
            });
            
            if (!modelParsed.success) {
              reject(new Error(modelParsed.error?.message || 'Invalid schema'));
              return;
            }
            
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        
        reader.readAsText(file);
      });
      
      // Wait for file validation
      await readFilePromise;
      
      // If validation succeeded, upload to endpoint
      const response = await fetch(`${API_ENDPOINT}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Server responded with status: ${response.status}`);
      }
      
      message.success('File successfully uploaded and validated!');
    } catch (e: any) {
      console.error('File upload error:', e);
      message.error(`Failed to upload file: ${e.message}`);
    }
  };

  const downloadJDM = async () => {
    try {
      const { name } = decisionGraphRaw.stateStore.getState();
      const { decisionGraph } = decisionGraphRaw.stateStore.getState();
      // create file in browser
      const fileName = `${name.replaceAll('.json', '')}.json`;
      const json = JSON.stringify(
        {
          contentType: DecisionContentType,
          nodes: decisionGraph.nodes,
          edges: decisionGraph.edges,
          settings: decisionGraph.settings,
        },
        null,
        2,
      );
      const blob = new Blob([json], { type: 'application/json' });
      const href = URL.createObjectURL(blob);

      // create "a" HTLM element with href to file
      const link = window.document.createElement('a');
      link.href = href;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();

      // clean up "a" element & remove ObjectURL
      window.document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const downloadJDMExcel = async (name: string = 'decision tables') => {
    try {
      const { decisionGraph } = decisionGraphRaw.stateStore.getState();
      const decisionTableNodes = decisionGraph.nodes
        .filter((node) => node.type === NodeKind.DecisionTable)
        .map((decisionTable) => ({
          ...decisionTable.content,
          id: decisionTable.id,
          name: decisionTable.name,
        }));

      await exportExcelFile(name, decisionTableNodes);
      message.success('Excel file has been downloaded successfully!');
    } catch {
      message.error('Failed to download Excel file!');
    }
  };

  const uploadItems: MenuProps['items'] = [
    {
      key: 'upload-json',
      label: 'Upload JSON',
      onClick: () => fileInput?.current?.click?.(),
    },
    {
      key: 'upload-excel',
      label: 'Upload Excel',
      onClick: () => excelFileInput?.current?.click?.(),
    },
    {
      key: 'upload-current-to-server',
      label: 'Upload Current to Server',
      onClick: () => uploadToEndpoint(),
    },
    {
      key: 'upload-file-to-server',
      label: 'Upload File to Server',
      onClick: () => uploadFileToEndpoint(),
    },
  ];

  const downloadItems: MenuProps['items'] = [
    {
      key: 'download-json',
      label: 'Download JSON',
      onClick: () => downloadJDM(),
    },
    {
      key: 'download-excel',
      label: 'Download Excel',
      onClick: () => downloadJDMExcel(),
    },
  ];

  return (
    <div className={'grl-dg__aside'}>
      <input
        hidden
        accept='application/json'
        type='file'
        ref={fileInput}
        onChange={handleUploadInput}
        onClick={(event) => {
          (event.target as any).value = null;
        }}
      />
      <input
        hidden
        accept='.xlsx'
        type='file'
        ref={excelFileInput}
        onChange={uploadJDMExcel}
        onClick={(event) => {
          (event.target as any).value = null;
        }}
      />
      <div className={'grl-dg__aside__side-bar'}>
        <div className={'grl-dg__aside__side-bar__top'}>
          {!disabled && (
            <Dropdown menu={{ items: uploadItems }} placement='bottomRight' trigger={['click']} arrow>
              <Button type={'text'} disabled={disabled} icon={<CloudUploadOutlined />} />
            </Dropdown>
          )}
          <Dropdown menu={{ items: downloadItems }} placement='bottomRight' trigger={['click']} arrow>
            <Button type={'text'} icon={<CloudDownloadOutlined />} />
          </Dropdown>
       
            <Dropdown menu={{ items: uploadItems }} placement='bottomRight' trigger={['click']} arrow>
              <Button type={'text'} disabled={disabled} icon={<CloudUploadOutlined />} />
            </Dropdown>
         
          <Dropdown menu={{ items: uploadItems }} placement='bottomRight' trigger={['click']} arrow>
            <Button type={'text'} icon={<CloudUploadOutlined  />} />
          </Dropdown>
        </div>
        <div className={'grl-dg__aside__side-bar__bottom'}>
          {(panels || []).map((panel) => {
            const isActive = activePanel === panel.id;
            return (
              <Tooltip
                key={panel.id}
                title={`${!isActive ? 'Open' : 'Close'} ${panel.title.toLowerCase()} panel`}
                placement={'right'}
              >
                <Button
                  key={panel.id}
                  type='text'
                  icon={panel.icon}
                  style={{ background: isActive ? 'rgba(0, 0, 0, 0.1)' : undefined }}
                  onClick={() => {
                    if (panel?.onClick) return panel.onClick();
                    if (panel?.renderPanel) setActivePanel(isActive ? undefined : panel.id);
                  }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
};