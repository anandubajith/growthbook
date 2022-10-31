import React, { FC, useState } from "react";
import Modal from "../../../Modal";
import {
  DataSourceInterfaceWithParams,
  ExposureQuery,
} from "back-end/types/datasource";
import { useForm } from "react-hook-form";
import cloneDeep from "lodash/cloneDeep";
import uniqId from "uniqid";
import Field from "../../../Forms/Field";
import CodeTextArea from "../../../Forms/CodeTextArea";
import Tooltip from "../../../Tooltip";
import StringArrayField from "../../../Forms/StringArrayField";
import { validateSQL } from "../../../../services/datasources";
import { useAuth } from "../../../../services/auth";
import DisplayTestQueryResults, {
  TestQueryResults,
} from "../../DisplayTestQueryResults";
import { FaPlay } from "react-icons/fa";

type EditExperimentAssignmentQueryProps = {
  exposureQuery?: ExposureQuery;
  dataSource: DataSourceInterfaceWithParams;
  mode: "add" | "edit";
  onSave: (exposureQuery: ExposureQuery) => void;
  onCancel: () => void;
};

export const AddEditExperimentAssignmentQueryModal: FC<EditExperimentAssignmentQueryProps> = ({
  exposureQuery,
  dataSource,
  mode,
  onSave,
  onCancel,
}) => {
  const [queryError, setQueryError] = useState<null | string>();
  const [
    testQueryResults,
    setTestQueryResults,
  ] = useState<TestQueryResults | null>(null);
  const { apiCall } = useAuth();
  const modalTitle =
    mode === "add"
      ? "Add an Experiment Assignment query"
      : `Edit ${exposureQuery.name}`;

  const userIdTypeOptions = dataSource.settings.userIdTypes.map(
    ({ userIdType }) => ({
      display: userIdType,
      value: userIdType,
    })
  );
  const defaultUserId = userIdTypeOptions[0]?.value || "user_id";

  const form = useForm<ExposureQuery>({
    defaultValues:
      mode === "edit"
        ? cloneDeep<ExposureQuery>(exposureQuery)
        : {
            description: "",
            id: uniqId("tbl_"),
            name: "",
            dimensions: [],
            query: `SELECT\n  ${defaultUserId} as ${defaultUserId},\n  timestamp as timestamp,\n  experiment_id as experiment_id,\n  variation_id as variation_id\nFROM my_table`,
            userIdType: userIdTypeOptions[0]?.value || "",
          },
  });

  // User-entered values
  const userEnteredUserIdType = form.watch("userIdType");
  const userEnteredQuery = form.watch("query");
  const userEnteredHasNameCol = form.watch("hasNameCol");
  const userEnteredDimensions = form.watch("dimensions");

  const getRequiredColumns = (value: ExposureQuery) => {
    return [
      "experiment_id",
      "variation_id",
      "timestamp",
      value.userIdType,
      ...(value.dimensions || []),
      ...(value.hasNameCol ? ["experiment_name", "variation_name"] : []),
    ];
  };

  const handleSubmit = form.handleSubmit(async (value) => {
    validateSQL(value.query, getRequiredColumns(value));

    await onSave(value);

    form.reset({
      id: null,
      query: "",
      name: "",
      dimensions: [],
      description: "",
      hasNameCol: false,
      userIdType: null,
    });
  });

  const identityTypes = dataSource.settings.userIdTypes || [];

  const saveEnabled = !!userEnteredUserIdType && !!userEnteredQuery;

  if (!exposureQuery && mode === "edit") {
    console.error(
      "ImplementationError: exposureQuery is required for Edit mode"
    );
    return null;
  }

  const handleTestQuery = async () => {
    setTestQueryResults(null);
    setQueryError(null);

    const value: ExposureQuery = {
      name: exposureQuery.name,
      query: userEnteredQuery,
      id: dataSource.id,
      userIdType: userEnteredUserIdType,
      dimensions: userEnteredDimensions,
      hasNameCol: userEnteredHasNameCol ? userEnteredHasNameCol : false,
    };

    try {
      const requiredColumns = getRequiredColumns(value);
      validateSQL(value.query, requiredColumns);

      const res: TestQueryResults = await apiCall("/query/test", {
        method: "POST",
        body: JSON.stringify({
          query: value.query,
          datasourceId: value.id,
          requiredColumns,
        }),
      });

      if (res.includesNamedColumns && !value.hasNameCol) {
        // If the query includes named columns, but hasNameCol is false
        // force hasNameCol to true in order to identify if any required name columns
        // are missing, enable hasNameCols for the user, and then throw applicable error.
        value.hasNameCol = true;

        const requiredColumns = getRequiredColumns(value);

        form.setValue("hasNameCol", true);
        validateSQL(value.query, requiredColumns);
      }

      if (res.error) {
        setQueryError(res.error);
        return;
      }

      setTestQueryResults(res);
    } catch (e) {
      setQueryError(e.message);
    }
  };

  return (
    <Modal
      open={true}
      submit={handleSubmit}
      close={onCancel}
      size="max"
      header={modalTitle}
      cta="Save"
      ctaEnabled={saveEnabled}
      autoFocusSelector="#id-modal-identify-joins-heading"
      error={queryError}
    >
      <div className="my-2 ml-3">
        <div className="row">
          <div className="col-xs-12">
            <Field label="Display Name" required {...form.register("name")} />
            <Field
              label="Description (optional)"
              textarea
              minRows={1}
              {...form.register("description")}
            />
            <Field
              label="Identifier Type"
              options={identityTypes.map((i) => i.userIdType)}
              required
              {...form.register("userIdType")}
            />
            <StringArrayField
              label="Dimension Columns"
              value={userEnteredDimensions}
              onChange={(dimensions) => {
                form.setValue("dimensions", dimensions);
              }}
            />
            <div className="row">
              <div className="col">
                <Field
                  label="SQL Query"
                  render={() => {
                    return (
                      <>
                        <div
                          className="d-flex justify-content-between align-items-center p-1"
                          style={{
                            backgroundColor: "#F0F0F0",
                            borderRadius: "5px",
                            border: "1px solid lightgray",
                          }}
                        >
                          <button
                            className="btn btn-sm btn-primary m-1"
                            onClick={(e) => {
                              e.preventDefault();
                              handleTestQuery();
                            }}
                          >
                            <span className="pr-2">
                              <FaPlay />
                            </span>
                            Test Query
                          </button>
                          <div className="d-flex m-1">
                            <label className="mr-2 mb-0">
                              Use Name Columns
                            </label>
                            <input
                              type="checkbox"
                              id="exposure-query-toggle"
                              className="form-check-input "
                              {...form.register("hasNameCol")}
                            />
                            <Tooltip body="Enable this if you store experiment/variation names as well as ids in your table" />
                          </div>
                        </div>
                        <CodeTextArea
                          required
                          language="sql"
                          value={userEnteredQuery}
                          setValue={(sql) => form.setValue("query", sql)}
                        />
                      </>
                    );
                  }}
                />
              </div>
              <div className="col-md-5 col-lg-4">
                <div className="pt-md-4">
                  <strong>Required columns</strong>
                </div>
                <ul>
                  <li>
                    <code>{userEnteredUserIdType}</code>
                  </li>
                  <li>
                    <code>timestamp</code>
                  </li>
                  <li>
                    <code>experiment_id</code>
                  </li>
                  <li>
                    <code>variation_id</code>
                  </li>
                  {userEnteredHasNameCol && (
                    <>
                      <li>
                        <code>experiment_name</code>
                      </li>
                      <li>
                        <code>variation_name</code>
                      </li>
                    </>
                  )}
                  {userEnteredDimensions &&
                    userEnteredDimensions.map((dimension) => {
                      return (
                        <li key={dimension}>
                          <code>{dimension}</code>
                        </li>
                      );
                    })}
                </ul>
                <div>
                  Any additional columns you select can be listed as dimensions
                  to drill down into experiment results.
                </div>
              </div>
            </div>
            {testQueryResults && (
              <DisplayTestQueryResults
                form={form}
                testQueryResults={testQueryResults}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
